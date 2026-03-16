import fs from "node:fs/promises";
import path from "node:path";
import type { ClientDefinition, SyncPlanEntry } from "../types/index.js";
import { readCanonicalState } from "./canonicalState.js";
import { fileExists } from "./fs.js";

export interface StaleFile {
  path: string;
  reason: string;
}

/**
 * Known valid entries at the root of the canonical `.agents/` directory.
 * Anything else is orphaned from a previous configuration.
 */
const CANONICAL_VALID_ENTRIES = new Set(["AGENTS.md", "skills", "mcp.json"]);

/**
 * Find stale files that link-agents previously managed but are no longer
 * part of the current sync plan. Uses the canonical-state.json ledger
 * written after each sync.
 */
export async function findStaleFromState(
  currentPlan: SyncPlanEntry[],
): Promise<StaleFile[]> {
  const oldState = await readCanonicalState();
  if (oldState.generated.length === 0) return [];

  const currentPaths = new Set(
    currentPlan.filter((e) => e.action !== "skip").map((e) => e.targetPath),
  );

  const stale: StaleFile[] = [];

  for (const entry of oldState.generated) {
    if (!currentPaths.has(entry.path) && (await fileExists(entry.path))) {
      stale.push({
        path: entry.path,
        reason: `previously synced for ${entry.targetClient} (${entry.type}) but no longer in plan`,
      });
    }
  }

  return stale;
}

/**
 * Scan the canonical `.agents/` directory for top-level entries that
 * don't match any current canonical pattern. Also detects duplicate
 * skill directories inside `skills/` (e.g. `commands-review/` when
 * `review/` already exists from a path restructure).
 */
export async function findStaleCanonicalEntries(
  canonicalRoot: string,
): Promise<StaleFile[]> {
  if (!(await fileExists(canonicalRoot))) return [];

  const entries = await fs.readdir(canonicalRoot);
  const stale: StaleFile[] = [];

  for (const entry of entries) {
    if (entry.endsWith(".bak") || entry.startsWith(".")) continue;

    if (!CANONICAL_VALID_ENTRIES.has(entry)) {
      const fullPath = path.join(canonicalRoot, entry);
      stale.push({
        path: fullPath,
        reason: "not a recognized canonical asset directory",
      });
    }
  }

  // Scan skills/ for duplicate prefixed dirs (e.g. commands-review/ when review/ exists)
  const skillsRoot = path.join(canonicalRoot, "skills");
  if (await fileExists(skillsRoot)) {
    let skillEntries: string[];
    try {
      skillEntries = await fs.readdir(skillsRoot);
    } catch {
      skillEntries = [];
    }

    const skillNames = new Set(skillEntries);

    for (const entry of skillEntries) {
      if (entry.endsWith(".bak") || entry.startsWith(".")) continue;

      // Detect skills prefixed with a retired asset type dir name
      // (e.g. commands-review when review already exists)
      for (const retired of RETIRED_ASSET_DIRS) {
        const prefix = retired + "-";
        if (entry.startsWith(prefix)) {
          const unprefixed = entry.slice(prefix.length);
          if (skillNames.has(unprefixed)) {
            stale.push({
              path: path.join(skillsRoot, entry),
              reason: `duplicate of ${unprefixed}`,
            });
          }
        }
      }
    }
  }

  return stale;
}

/**
 * Directories that were previously managed asset types but have been removed.
 * These are safe to flag as stale when found in client roots.
 */
const RETIRED_ASSET_DIRS = ["commands", "prompts"];

/**
 * Scan client roots for directories left over from retired asset types
 * (e.g. `commands/` after the commands→skills migration).
 */
export async function findStaleClientEntries(
  defs: ClientDefinition[],
): Promise<StaleFile[]> {
  const stale: StaleFile[] = [];

  for (const def of defs) {
    if (!(await fileExists(def.root))) continue;

    // Build set of directory names that this client currently manages
    const managedDirs = new Set<string>();
    for (const asset of def.assets) {
      for (const pattern of asset.patterns) {
        const topDir = pattern.split("/")[0];
        if (topDir && !topDir.includes("*") && !topDir.includes(".")) {
          managedDirs.add(topDir);
        }
      }
    }

    for (const retiredDir of RETIRED_ASSET_DIRS) {
      if (managedDirs.has(retiredDir)) continue;
      const dirPath = path.join(def.root, retiredDir);
      if (await fileExists(dirPath)) {
        stale.push({
          path: dirPath,
          reason: `retired asset directory in ${def.name}`,
        });
      }
    }
  }

  return stale;
}

/**
 * Scan client skill directories for skill folders that aren't in the
 * current fanout plan. Catches orphans from path renames/flattening
 * (e.g. `commands-review/` after `skills/commands/review/` was moved to
 * `skills/review/`).
 */
export async function findOrphanedClientSkills(
  defs: ClientDefinition[],
  currentPlan: SyncPlanEntry[],
): Promise<StaleFile[]> {
  // Build set of target paths from the plan
  const plannedPaths = new Set(currentPlan.map((e) => e.targetPath));

  const stale: StaleFile[] = [];

  for (const def of defs) {
    // Find the skills asset pattern to get the directory name
    const skillsAsset = def.assets.find((a) => a.type === "skills");
    if (!skillsAsset || skillsAsset.patterns.length === 0) continue;

    // Extract skills dir name from pattern (e.g. "skills" or "skill")
    const skillsDir = skillsAsset.patterns[0].split("/")[0];
    const skillsRoot = path.join(def.root, skillsDir);

    if (!(await fileExists(skillsRoot))) continue;

    let entries: string[];
    try {
      entries = await fs.readdir(skillsRoot);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.endsWith(".bak") || entry.startsWith(".")) continue;

      const skillDir = path.join(skillsRoot, entry);
      const skillFile = path.join(skillDir, "SKILL.md");

      // Check if any plan entry targets a file under this skill dir
      const isPlanned = [...plannedPaths].some(
        (p) => p === skillFile || p.startsWith(skillDir + "/"),
      );

      // Check if SKILL.md exists (real file or broken symlink)
      const skillExists =
        (await fileExists(skillFile)) || (await lstatExists(skillFile));

      if (!isPlanned && skillExists) {
        stale.push({
          path: skillDir,
          reason: `orphaned skill in ${def.name} (not in current plan)`,
        });
      }
    }
  }

  return stale;
}

/**
 * Remove stale files and clean up empty parent directories.
 */
export async function removeStaleFiles(
  staleFiles: StaleFile[],
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;

  for (const stale of staleFiles) {
    try {
      await fs.rm(stale.path, { recursive: true, force: true });
      removed++;

      // Clean up empty parent directories
      const parent = path.dirname(stale.path);
      await removeEmptyDirs(parent);
    } catch {
      failed++;
    }
  }

  return { removed, failed };
}

async function lstatExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeEmptyDirs(dirPath: string): Promise<void> {
  // Never climb above the user's home directory to avoid removing
  // system directories or client roots like ~/.claude.
  const home = process.env.HOME ?? "/";
  if (
    dirPath === home ||
    dirPath === "/" ||
    dirPath === path.dirname(dirPath)
  ) {
    return;
  }
  try {
    const entries = await fs.readdir(dirPath);
    if (entries.length === 0) {
      await fs.rmdir(dirPath);
      await removeEmptyDirs(path.dirname(dirPath));
    }
  } catch {
    // Not a directory or doesn't exist
  }
}
