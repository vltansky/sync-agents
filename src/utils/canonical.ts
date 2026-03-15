import path from "node:path";
import type {
  AssetContent,
  AssetType,
  ClientDefinition,
  ManagedAssetType,
} from "../types/index.js";
import {
  buildClientDefinitions,
  clientSupportsAssetType,
} from "../clients/definitions.js";
import { discoverAssets } from "./discovery.js";
import { hashContent } from "./fs.js";
import { ensureSkillFrontmatter } from "./frontmatter.js";
import {
  detectMcpFormat,
  mergeMcpConfigs,
  parseMcpConfig,
  serializeMcpConfig,
} from "./mcp.js";
import {
  buildTargetAbsolutePath,
  remapRelativePathForTarget,
  resolveTargetRelativePath,
} from "./paths.js";
import { shouldSkipTargetAsset } from "./syncFilters.js";
import type { SyncCommandOptions, SyncPlanEntry } from "../types/index.js";

export function buildCanonicalDefinition(
  projectRoot: string,
): ClientDefinition {
  return {
    name: "canonical",
    displayName: "Canonical",
    root: path.join(projectRoot, ".agents"),
    assets: [
      { type: "agents", patterns: ["AGENTS.md"] },
      { type: "skills", patterns: ["skills/**/SKILL.md"] },
      { type: "mcp", patterns: [], files: ["mcp.json"] },
    ],
  };
}

export function buildLegacyDefinitions(
  projectRoot: string,
): ClientDefinition[] {
  return buildClientDefinitions(projectRoot);
}

export async function discoverCanonicalAssets(
  projectRoot: string,
  types?: ManagedAssetType[],
): Promise<AssetContent[]> {
  return discoverAssets([buildCanonicalDefinition(projectRoot)], {
    types: types as AssetType[] | undefined,
  });
}

export async function discoverLegacyAssets(
  projectRoot: string,
  types?: ManagedAssetType[],
): Promise<AssetContent[]> {
  const defs = buildLegacyDefinitions(projectRoot);
  return discoverAssets(defs, { types: types as AssetType[] | undefined });
}

export async function discoverIgnoredCursorRules(
  projectRoot: string,
): Promise<AssetContent[]> {
  const cursorDef = buildLegacyDefinitions(projectRoot).find(
    (def) => def.name === "cursor",
  );
  if (!cursorDef) {
    return [];
  }
  return discoverAssets([
    {
      ...cursorDef,
      assets: [
        { type: "rules", patterns: ["rules/**/*.md", "rules/**/*.mdc"] },
      ],
    },
  ]);
}

export function groupAssetsByCanonicalKey(
  assets: AssetContent[],
): Map<string, AssetContent[]> {
  const grouped = new Map<string, AssetContent[]>();
  for (const asset of assets) {
    const canonicalPath = asset.canonicalPath ?? asset.relativePath;
    const key = `${asset.type}::${canonicalPath}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(asset);
    grouped.set(key, bucket);
  }
  return grouped;
}

export function synthesizeCanonicalAsset(
  projectRoot: string,
  asset: AssetContent,
): AssetContent {
  const canonicalPath = asset.canonicalPath ?? asset.relativePath;
  return {
    ...asset,
    client: "canonical",
    path: path.join(projectRoot, ".agents", canonicalPath),
    relativePath: canonicalPath,
    canonicalPath,
  };
}

export function materializeCanonicalAsset(
  projectRoot: string,
  asset: AssetContent,
): AssetContent {
  const canonicalAsset = synthesizeCanonicalAsset(projectRoot, asset);
  let materialized = canonicalAsset;

  if (
    materialized.type === "skills" &&
    !materialized.content.startsWith("---")
  ) {
    const skillContent = ensureSkillFrontmatter(
      materialized.content,
      materialized.name,
    );
    materialized = {
      ...materialized,
      content: skillContent,
      hash: hashContent(skillContent),
    };
  }

  if (materialized.type === "mcp") {
    const format = detectMcpFormat(asset.path);
    if (format !== "json" && format !== "jsonc") {
      const parsed = parseMcpConfig(materialized.content, format);
      if (parsed?.mcpServers) {
        const jsonContent = serializeMcpConfig(parsed, "json");
        materialized = {
          ...materialized,
          content: jsonContent,
          hash: hashContent(jsonContent),
        };
      }
    }
  }

  return materialized;
}

export function selectLatestAsset(candidates: AssetContent[]): AssetContent {
  if (candidates.length === 0) {
    throw new Error("selectLatestAsset requires at least one candidate");
  }

  return [...candidates].sort(compareAssetFreshness)[0];
}

export function collectCanonicalAsset(
  projectRoot: string,
  candidates: AssetContent[],
): AssetContent {
  const newest = selectLatestAsset(candidates);
  if (newest.type !== "mcp") {
    return materializeCanonicalAsset(projectRoot, newest);
  }

  const mergedConfigs = [...candidates]
    .sort(compareAssetFreshness)
    .reverse()
    .map((asset) => parseMcpConfig(asset.content, detectMcpFormat(asset.path)))
    .filter((config): config is NonNullable<typeof config> => config !== null);

  if (mergedConfigs.length === 0) {
    return materializeCanonicalAsset(projectRoot, newest);
  }

  const content = serializeMcpConfig(mergeMcpConfigs(mergedConfigs), "json");
  const canonicalAsset = synthesizeCanonicalAsset(projectRoot, newest);
  return {
    ...canonicalAsset,
    content,
    hash: hashContent(content),
  };
}

function compareAssetFreshness(a: AssetContent, b: AssetContent): number {
  const timeA = a.modifiedAt?.getTime() ?? 0;
  const timeB = b.modifiedAt?.getTime() ?? 0;
  if (timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.client === "canonical" && b.client !== "canonical") {
    return -1;
  }
  if (b.client === "canonical" && a.client !== "canonical") {
    return 1;
  }
  const clientCmp = a.client.localeCompare(b.client);
  if (clientCmp !== 0) {
    return clientCmp;
  }
  return a.path.localeCompare(b.path);
}

export function buildBootstrapEntry(
  projectRoot: string,
  asset: AssetContent,
): SyncPlanEntry {
  const canonicalAsset = materializeCanonicalAsset(projectRoot, asset);

  return {
    asset: canonicalAsset,
    targetClient: "canonical",
    targetPath: canonicalAsset.path,
    targetRelativePath: canonicalAsset.relativePath,
    action: "create",
    reason: "import",
  };
}

export function buildFanoutPlan(
  canonicalAssets: AssetContent[],
  defs: ClientDefinition[],
  options: SyncCommandOptions,
): SyncPlanEntry[] {
  const plan: SyncPlanEntry[] = [];

  for (const asset of canonicalAssets) {
    for (const def of defs) {
      if (shouldSkipTargetAsset(options, def.name, asset)) {
        continue;
      }

      if (!clientSupportsAssetType(def, asset.type)) {
        continue;
      }

      const baseRelative = resolveTargetRelativePath(def.name, asset);
      const targetRelative = remapRelativePathForTarget(
        asset,
        def.name,
        baseRelative,
        defs,
      );
      const targetPath = buildTargetAbsolutePath(def.root, targetRelative);

      if (targetPath !== asset.path) {
        plan.push({
          asset,
          targetClient: def.name,
          targetPath,
          targetRelativePath: targetRelative,
          action: "create",
          reason: "sync",
        });
      }
    }
  }

  return plan;
}

export function getBootstrapChoices(
  candidates: AssetContent[],
): { value: string; label: string; hint: string }[] {
  return candidates.map((asset, i) => ({
    value: asset.path,
    label: `${asset.client}: ${asset.relativePath}`,
    hint: `${formatRelativeTime(asset.modifiedAt)}${i === 0 ? " - newest" : ""}`,
  }));
}

function formatRelativeTime(date: Date | undefined): string {
  if (!date) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}
