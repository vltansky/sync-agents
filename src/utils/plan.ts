import type {
  AgentClientName,
  AssetContent,
  AssetType,
  ClientDefinition,
  SyncOptions,
  SyncPlanEntry,
} from "../types/index.js";
import { CLIENT_ORDER } from "../clients/definitions.js";
import {
  buildTargetAbsolutePath,
  resolveTargetRelativePath,
  normalizeRelativePath,
  remapRelativePathForTarget,
} from "./paths.js";
import { validatePathSafe } from "./validation.js";

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

  const plan: SyncPlanEntry[] = [];

  for (const def of defs) {
    if (clientFilter.size && !clientFilter.has(def.name)) {
      continue;
    }

    const supports = new Set(def.assets.map((a) => a.type));
    for (const [key, desired] of canonical.entries()) {
      if (!supports.has(desired.type)) {
        continue;
      }
      if (def.name === desired.client && options.mode !== "source") {
        // Already the canonical source, skip
        continue;
      }
      const baseRelative = resolveTargetRelativePath(def.name, desired);
      const targetRelative = remapRelativePathForTarget(
        desired,
        def.name,
        baseRelative,
      );
      const targetPath = buildTargetAbsolutePath(def.root, targetRelative);
      validatePathSafe(def.root, targetPath);
      const existing = existingMap.get(def.name)?.get(key);
      if (existing && existing.hash === desired.hash) {
        plan.push({
          asset: desired,
          targetClient: def.name,
          targetPath,
          action: "skip",
          reason: "up-to-date",
        });
        continue;
      }

      plan.push({
        asset: desired,
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
