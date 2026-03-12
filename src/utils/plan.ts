import type {
  AgentClientName,
  AssetContent,
  AssetType,
  ClientDefinition,
  SyncOptions,
  SyncPlanEntry,
} from "../types/index.js";
import {
  CLIENT_ORDER,
  clientSupportsAssetType,
} from "../clients/definitions.js";
import {
  buildTargetAbsolutePath,
  resolveTargetRelativePath,
  normalizeRelativePath,
  remapRelativePathForTarget,
} from "./paths.js";
import { validatePathSafe } from "./validation.js";
import {
  mergeRulesIntoAgents,
  shouldMergeRulesIntoAgents,
  getRulesForMerge,
} from "./merge.js";
import { hashContent } from "./fs.js";
import { shouldSkipTargetAsset } from "./syncFilters.js";

/**
 * Check if target client requires content transformation for this asset type.
 * When transformation is needed, we can't reliably compare source/target hashes
 * as they'll differ even if content is semantically up-to-date.
 */
function requiresTransformation(
  targetClient: AgentClientName,
  assetType: AssetType,
): boolean {
  // OpenCode requires frontmatter transformation for agents
  return targetClient === "opencode" && assetType === "agents";
}

export interface PlanResult {
  plan: SyncPlanEntry[];
  desiredAssets: Map<string, AssetContent>;
}

export function buildSyncPlan(
  assets: AssetContent[],
  defs: ClientDefinition[],
  options: SyncOptions,
): PlanResult {
  const priority = options.priority ?? CLIENT_ORDER;
  const typeFilter = new Set<AssetType>(options.types ?? []);
  const clientFilter = new Set<AgentClientName>(options.clients ?? []);

  const canonical = new Map<string, AssetContent>();

  const filteredAssets =
    options.mode === "source"
      ? assets.filter((asset) => asset.client === options.source)
      : assets;

  const sorted = filteredAssets.slice().sort((a, b) => {
    const priA = priority.indexOf(a.client);
    const priB = priority.indexOf(b.client);
    return priA - priB;
  });

  for (const asset of sorted) {
    if (typeFilter.size && !typeFilter.has(asset.type)) {
      continue;
    }
    const canonicalRel = getCanonicalRelative(asset);
    const key = makeAssetKey(asset.type, canonicalRel);
    if (!canonical.has(key)) {
      canonical.set(key, asset);
    }
  }

  const existingMap = new Map<AgentClientName, Map<string, AssetContent>>();
  for (const asset of assets) {
    const clientMap =
      existingMap.get(asset.client) ?? new Map<string, AssetContent>();
    clientMap.set(makeAssetKey(asset.type, getCanonicalRelative(asset)), asset);
    existingMap.set(asset.client, clientMap);
  }

  // Collect rules for merging into agents for clients that don't support rules
  const sourceClient = options.mode === "source" ? options.source : undefined;
  const rulesToMerge = getRulesForMerge(filteredAssets, sourceClient);

  const plan: SyncPlanEntry[] = [];

  for (const def of defs) {
    if (clientFilter.size && !clientFilter.has(def.name)) {
      continue;
    }

    const supports = new Set(def.assets.map((a) => a.type));
    const needsRulesMerge =
      shouldMergeRulesIntoAgents(def) && rulesToMerge.length > 0;

    for (const [key, desired] of canonical.entries()) {
      // Skip rules for clients that don't support them - they'll be merged into agents
      if (desired.type === "rules" && !clientSupportsAssetType(def, "rules")) {
        continue;
      }
      if (shouldSkipTargetAsset(options, def.name, desired)) {
        continue;
      }
      if (!supports.has(desired.type)) {
        continue;
      }
      if (def.name === desired.client && options.mode !== "source") {
        // Already the canonical source, skip
        continue;
      }

      // For agents on clients without rules support, merge rules into content
      let assetToWrite = desired;
      if (desired.type === "agents" && needsRulesMerge) {
        const mergedContent = mergeRulesIntoAgents(
          desired.content,
          rulesToMerge,
        );
        assetToWrite = {
          ...desired,
          content: mergedContent,
          hash: hashContent(mergedContent),
        };
      }

      const baseRelative = resolveTargetRelativePath(def.name, assetToWrite);
      const targetRelative = remapRelativePathForTarget(
        assetToWrite,
        def.name,
        baseRelative,
        defs,
      );
      const targetPath = buildTargetAbsolutePath(def.root, targetRelative);
      validatePathSafe(def.root, targetPath);
      const existing = existingMap.get(def.name)?.get(key);
      // Don't skip if target requires transformation - let apply phase compare transformed content
      const needsTransform = requiresTransformation(
        def.name,
        assetToWrite.type,
      );
      // Also don't skip if rules were merged - hash will differ
      if (
        existing &&
        existing.hash === assetToWrite.hash &&
        !needsTransform &&
        !needsRulesMerge
      ) {
        plan.push({
          asset: assetToWrite,
          targetClient: def.name,
          targetPath,
          action: "skip",
          reason: "up-to-date",
        });
        continue;
      }

      plan.push({
        asset: assetToWrite,
        targetClient: def.name,
        targetPath,
        targetRelativePath: targetRelative,
        action: existing ? "update" : "create",
      });
    }
  }

  return { plan, desiredAssets: canonical };
}

function makeAssetKey(type: AssetType, relativePath: string): string {
  return `${type}::${normalizeRelativePath(relativePath)}`;
}

function getCanonicalRelative(asset: AssetContent): string {
  return normalizeRelativePath(asset.canonicalPath ?? asset.relativePath);
}
