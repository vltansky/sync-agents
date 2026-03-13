import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SyncOptions, SyncPlanEntry } from "../types/index.js";
import {
  writeFileSafe,
  createBackup,
  restoreBackup,
  verifyFileHash,
  readFileSafe,
  hashContent,
  fileExists,
} from "./fs.js";
import { transformContentForClient } from "./frontmatter.js";
import { updateManifest, pruneStaleFiles } from "./manifest.js";

const BACKUP_DIR = path.join(os.homedir(), ".agsync", "backups");
const MAX_BACKUPS = 10;

export interface ApplyResult {
  applied: number;
  skipped: number;
  failed: number;
  backups: string[];
  errors: string[];
  rolledBack: boolean;
}

interface AppliedChange {
  targetPath: string;
  backupPath: string | null;
}

function getWriteModeLabel(
  useSymlink: boolean,
  action: SyncPlanEntry["action"],
): string {
  return useSymlink ? "link" : action;
}

export async function applyPlan(
  plan: SyncPlanEntry[],
  options: SyncOptions,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    applied: 0,
    skipped: 0,
    failed: 0,
    backups: [],
    errors: [],
    rolledBack: false,
  };

  if (plan.length === 0) {
    if (options.verbose) {
      console.log(chalk.green("No changes required."));
    }
    return result;
  }

  const appliedChanges: AppliedChange[] = [];

  for (const entry of plan) {
    const displayPath = entry.targetRelativePath ?? entry.asset.relativePath;

    if (entry.action === "skip") {
      if (options.verbose) {
        console.log(
          chalk.gray(`skip   ${entry.targetClient} :: ${displayPath}`),
        );
      }
      result.skipped++;
      continue;
    }

    // Transform content for target client (e.g., OpenCode frontmatter format)
    const transformedContent = transformContentForClient(
      entry.asset.content,
      entry.targetClient,
      entry.asset.type,
    );
    const symlinkEligible =
      Boolean(options.link) &&
      (await canWriteAsSymlink(entry, transformedContent));
    const actionLabel = getWriteModeLabel(symlinkEligible, entry.action);

    if (symlinkEligible) {
      const alreadyLinked = await isSymlinkToTarget(
        entry.targetPath,
        entry.asset.path,
      );
      if (alreadyLinked) {
        if (options.verbose) {
          console.log(
            chalk.gray(`unchanged ${entry.targetClient} :: ${displayPath}`),
          );
        }
        result.skipped++;
        continue;
      }
    } else {
      // Check if file already has identical content (skip unchanged)
      const existingContent = await readFileSafe(entry.targetPath);
      if (existingContent !== null) {
        const existingHash = hashContent(existingContent);
        const newHash = hashContent(transformedContent);
        if (existingHash === newHash) {
          if (options.verbose) {
            console.log(
              chalk.gray(`unchanged ${entry.targetClient} :: ${displayPath}`),
            );
          }
          result.skipped++;
          continue;
        }
      }
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow(
          `${actionLabel.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
        ),
      );
      result.applied++;
      continue;
    }

    let backupPath: string | null = null;

    try {
      // Create backup before overwrite
      backupPath = await createBackup(entry.targetPath);
      if (backupPath) {
        result.backups.push(backupPath);
        if (options.verbose) {
          console.log(chalk.dim(`  backup: ${backupPath}`));
        }
      }

      if (symlinkEligible) {
        await writeSymlinkSafe(entry.asset.path, entry.targetPath);
      } else {
        await writeFileSafe(entry.targetPath, transformedContent);
      }
      console.log(
        chalk.green(
          `${actionLabel.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
        ),
      );

      // Post-sync verification
      const verified = symlinkEligible
        ? await isSymlinkToTarget(entry.targetPath, entry.asset.path)
        : await verifyFileHash(entry.targetPath, transformedContent);
      if (!verified) {
        const error = `Verification failed for ${entry.targetPath}`;
        result.errors.push(error);
        console.log(chalk.red(`  ✗ ${error}`));
        result.failed++;
        await rollbackChanges(appliedChanges, result, options.verbose);
        return result;
      }

      appliedChanges.push({ targetPath: entry.targetPath, backupPath });
      result.applied++;
    } catch (err) {
      const error = `Failed to write ${entry.targetPath}: ${err}`;
      result.errors.push(error);
      console.log(chalk.red(`  ✗ ${error}`));
      result.failed++;
      await rollbackChanges(appliedChanges, result, options.verbose);
      return result;
    }
  }

  return result;
}

async function canWriteAsSymlink(
  entry: SyncPlanEntry,
  transformedContent: string,
): Promise<boolean> {
  const sourceContent = await readFileSafe(entry.asset.path);
  return sourceContent === transformedContent;
}

async function isSymlinkToTarget(
  linkPath: string,
  targetPath: string,
): Promise<boolean> {
  try {
    const stats = await fs.lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }

    const linkTarget = await fs.readlink(linkPath);
    const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);
    return resolvedTarget === path.resolve(targetPath);
  } catch {
    return false;
  }
}

async function writeSymlinkSafe(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.rm(targetPath, { force: true, recursive: true });

  const linkTarget = path.relative(path.dirname(targetPath), sourcePath);
  await fs.symlink(linkTarget, targetPath);
}

async function rollbackChanges(
  changes: AppliedChange[],
  result: ApplyResult,
  verbose?: boolean,
): Promise<void> {
  if (changes.length === 0) return;

  console.log();
  console.log(chalk.yellow(`Rolling back ${changes.length} change(s)...`));

  for (const change of changes.reverse()) {
    if (change.backupPath) {
      const restored = await restoreBackup(
        change.backupPath,
        change.targetPath,
      );
      if (restored) {
        if (verbose) {
          console.log(chalk.dim(`  restored: ${change.targetPath}`));
        }
      } else {
        result.errors.push(`Failed to restore ${change.targetPath}`);
      }
    }
  }

  result.rolledBack = true;
  console.log(chalk.yellow("Rollback complete."));
}

/**
 * Cleanup old backups beyond MAX_BACKUPS limit.
 */
export async function cleanupOldBackups(): Promise<number> {
  try {
    if (!(await fileExists(BACKUP_DIR))) {
      return 0;
    }

    const entries = await fs.readdir(BACKUP_DIR);
    const backupDirs = entries
      .filter((e) => e.match(/^\d{4}-\d{2}-\d{2}T/))
      .sort()
      .reverse();

    if (backupDirs.length <= MAX_BACKUPS) {
      return 0;
    }

    const toDelete = backupDirs.slice(MAX_BACKUPS);
    let deleted = 0;

    for (const dir of toDelete) {
      try {
        await fs.rm(path.join(BACKUP_DIR, dir), { recursive: true });
        deleted++;
      } catch {
        // Ignore deletion errors
      }
    }

    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Update manifest with generated files and prune stale files.
 */
export async function postApplyCleanup(
  appliedPaths: string[],
  verbose?: boolean,
): Promise<{ pruned: string[]; manifestUpdated: boolean }> {
  // Prune stale files from previous syncs
  const pruned = await pruneStaleFiles(appliedPaths);
  if (pruned.length > 0 && verbose) {
    console.log(chalk.dim(`Cleaned up ${pruned.length} stale file(s)`));
    for (const f of pruned) {
      console.log(chalk.dim(`  removed: ${f}`));
    }
  }

  // Update manifest with current files
  await updateManifest(appliedPaths);

  // Cleanup old backups
  const deletedBackups = await cleanupOldBackups();
  if (deletedBackups > 0 && verbose) {
    console.log(chalk.dim(`Cleaned up ${deletedBackups} old backup(s)`));
  }

  return { pruned, manifestUpdated: true };
}
