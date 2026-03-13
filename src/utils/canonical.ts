import path from "node:path";
import type {
  AssetContent,
  AssetType,
  ClientDefinition,
  ManagedAssetType,
} from "../types/index.js";
import { buildClientDefinitions } from "../clients/definitions.js";
import { discoverAssets } from "./discovery.js";
import { hashContent } from "./fs.js";
import {
  buildTargetAbsolutePath,
  remapRelativePathForTarget,
  resolveTargetRelativePath,
} from "./paths.js";
import { shouldSkipTargetAsset } from "./syncFilters.js";
import type { SyncCommandOptions, SyncPlanEntry } from "../types/index.js";

const CODEX_COMMAND_METADATA = "policy:\n  allow_implicit_invocation: false\n";

export function buildCanonicalDefinition(
  projectRoot: string,
): ClientDefinition {
  return {
    name: "project",
    displayName: "Canonical",
    root: path.join(projectRoot, ".agents"),
    assets: [
      { type: "agents", patterns: ["AGENTS.md"] },
      { type: "commands", patterns: ["commands/**/*.md"] },
      { type: "skills", patterns: ["skills/**/SKILL.md"] },
      { type: "mcp", patterns: [], files: ["mcp.json"] },
    ],
  };
}

export function buildLegacyDefinitions(
  projectRoot: string,
): ClientDefinition[] {
  return buildClientDefinitions(projectRoot).filter(
    (def) => def.name !== "project",
  );
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
    client: "project",
    path: path.join(projectRoot, ".agents", canonicalPath),
    relativePath: canonicalPath,
    canonicalPath,
  };
}

export function buildBootstrapEntry(
  projectRoot: string,
  asset: AssetContent,
): SyncPlanEntry {
  const canonicalAsset = synthesizeCanonicalAsset(projectRoot, asset);
  return {
    asset,
    targetClient: "project",
    targetPath: canonicalAsset.path,
    targetRelativePath: canonicalAsset.relativePath,
    action: "create",
    reason: "bootstrap",
  };
}

export function buildFanoutPlan(
  canonicalAssets: AssetContent[],
  defs: ClientDefinition[],
  options: SyncCommandOptions,
): SyncPlanEntry[] {
  const targets = defs.filter(
    (def) => !options.clients || options.clients.includes(def.name),
  );
  const plan: SyncPlanEntry[] = [];

  for (const asset of canonicalAssets) {
    for (const def of targets) {
      if (shouldSkipTargetAsset(options, def.name, asset)) {
        continue;
      }

      const supportsType = def.assets.some(
        (entry) => entry.type === asset.type,
      );
      if (!supportsType) {
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
          reason: "fanout",
        });
      }

      if (def.name === "codex" && asset.type === "commands") {
        plan.push(
          buildCodexCommandMetadataEntry(asset, def.root, targetRelative),
        );
      }
    }
  }

  return plan;
}

function buildCodexCommandMetadataEntry(
  asset: AssetContent,
  root: string,
  commandTargetRelative: string,
): SyncPlanEntry {
  const metadataRelative = normalizeCodexMetadataPath(commandTargetRelative);
  const syntheticAsset: AssetContent = {
    ...asset,
    content: CODEX_COMMAND_METADATA,
    hash: hashContent(CODEX_COMMAND_METADATA),
    name: `${asset.name}-openai-yaml`,
  };

  return {
    asset: syntheticAsset,
    targetClient: "codex",
    targetPath: buildTargetAbsolutePath(root, metadataRelative),
    targetRelativePath: metadataRelative,
    action: "create",
    reason: "fanout",
  };
}

function normalizeCodexMetadataPath(commandTargetRelative: string): string {
  return commandTargetRelative.replace(/\/SKILL\.md$/i, "/agents/openai.yaml");
}

export function getBootstrapChoices(
  candidates: AssetContent[],
): { value: string; label: string; hint: string }[] {
  return candidates.map((asset) => ({
    value: asset.path,
    label: `${asset.client}: ${asset.relativePath}`,
    hint: asset.path,
  }));
}
