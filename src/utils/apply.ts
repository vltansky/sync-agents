import chalk from "chalk";
import type { SyncOptions, SyncPlanEntry } from "../types/index.js";
import {
  writeFileSafe,
  createSymlink,
  createBackup,
  verifyFileHash,
  readFileSafe,
  hashContent,
} from "./fs.js";

export interface ApplyResult {
  applied: number;
  skipped: number;
  failed: number;
  backups: string[];
  errors: string[];
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
  };

  if (plan.length === 0) {
    if (options.verbose) {
      console.log(chalk.green("No changes required."));
    }
    return result;
  }

  const useSymlinks = options.link ?? false;

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

    try {
      // Create backup before overwrite (only for existing files, not symlinks)
      if (!useSymlinks) {
        const backupPath = await createBackup(entry.targetPath);
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
          continue;
        }
      }

      result.applied++;
    } catch (err) {
      const error = `Failed to write ${entry.targetPath}: ${err}`;
      result.errors.push(error);
      console.log(chalk.red(`  ✗ ${error}`));
      result.failed++;
    }
  }

  return result;
}
