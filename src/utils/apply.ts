import chalk from "chalk";
import type { SyncOptions, SyncPlanEntry } from "../types/index.js";
import {
  writeFileSafe,
  createSymlink,
  createBackup,
  restoreBackup,
  verifyFileHash,
  readFileSafe,
  hashContent,
  getSymlinkTarget,
} from "./fs.js";

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

  const useSymlinks = options.link ?? false;
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

    // Check if file already has identical content (skip unchanged)
    if (!useSymlinks) {
      const existingContent = await readFileSafe(entry.targetPath);
      if (existingContent !== null) {
        const existingHash = hashContent(existingContent);
        const newHash = hashContent(entry.asset.content);
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
    } else {
      // For symlinks, check if already pointing to correct target
      const currentTarget = await getSymlinkTarget(entry.targetPath);
      if (currentTarget === entry.asset.path) {
        if (options.verbose) {
          console.log(
            chalk.gray(`unchanged ${entry.targetClient} :: ${displayPath}`),
          );
        }
        result.skipped++;
        continue;
      }
    }

    if (options.dryRun) {
      const action = useSymlinks ? "link" : entry.action;
      console.log(
        chalk.yellow(
          `${action.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
        ),
      );
      result.applied++;
      continue;
    }

    let backupPath: string | null = null;

    try {
      // Create backup before overwrite (only for existing files, not symlinks)
      if (!useSymlinks) {
        backupPath = await createBackup(entry.targetPath);
        if (backupPath) {
          result.backups.push(backupPath);
          if (options.verbose) {
            console.log(chalk.dim(`  backup: ${backupPath}`));
          }
        }
      }

      if (useSymlinks) {
        await createSymlink(entry.asset.path, entry.targetPath);
        console.log(
          chalk.cyan(
            `link    ${entry.targetClient} :: ${displayPath} -> ${entry.asset.path}`,
          ),
        );
      } else {
        await writeFileSafe(entry.targetPath, entry.asset.content);
        console.log(
          chalk.green(
            `${entry.action.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
          ),
        );
      }

      // Post-sync verification (only for regular writes, not symlinks)
      if (!useSymlinks) {
        const verified = await verifyFileHash(
          entry.targetPath,
          entry.asset.content,
        );
        if (!verified) {
          const error = `Verification failed for ${entry.targetPath}`;
          result.errors.push(error);
          console.log(chalk.red(`  ✗ ${error}`));
          result.failed++;
          await rollbackChanges(appliedChanges, result, options.verbose);
          return result;
        }
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
