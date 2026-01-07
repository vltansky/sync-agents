import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import { fileExists } from "./fs.js";
import { getManifestFiles, clearManifest } from "./manifest.js";
import { cleanGitignore } from "./gitignore.js";

const SYNC_AGENTS_DIR = path.join(os.homedir(), ".sync-agents");

export interface ResetResult {
  removedFiles: string[];
  removedBackups: boolean;
  cleanedGitignore: boolean;
  clearedManifest: boolean;
}

/**
 * Reset sync-agents: remove all generated files, backups, and manifest.
 */
export async function performReset(
  projectRoot: string,
  options: { dryRun?: boolean; verbose?: boolean } = {},
): Promise<ResetResult> {
  const result: ResetResult = {
    removedFiles: [],
    removedBackups: false,
    cleanedGitignore: false,
    clearedManifest: false,
  };

  // Get files from manifest
  const manifestFiles = await getManifestFiles();

  console.log(chalk.yellow("Resetting sync-agents..."));

  // Remove generated files
  for (const file of manifestFiles) {
    if (await fileExists(file)) {
      if (options.dryRun) {
        console.log(chalk.dim(`  would remove: ${file}`));
      } else {
        try {
          await fs.unlink(file);
          if (options.verbose) {
            console.log(chalk.dim(`  removed: ${file}`));
          }
          result.removedFiles.push(file);
        } catch {
          // File may have been manually deleted
        }
      }
    }
  }

  // Remove .sync-agents directory (includes backups and manifest)
  if (await fileExists(SYNC_AGENTS_DIR)) {
    if (options.dryRun) {
      console.log(chalk.dim(`  would remove: ${SYNC_AGENTS_DIR}`));
    } else {
      try {
        await fs.rm(SYNC_AGENTS_DIR, { recursive: true });
        result.removedBackups = true;
        result.clearedManifest = true;
        if (options.verbose) {
          console.log(chalk.dim(`  removed: ${SYNC_AGENTS_DIR}`));
        }
      } catch {
        // Directory may not exist
      }
    }
  }

  // Clean .gitignore
  if (options.dryRun) {
    console.log(chalk.dim(`  would clean: ${projectRoot}/.gitignore`));
  } else {
    const cleaned = await cleanGitignore(projectRoot);
    result.cleanedGitignore = cleaned;
    if (cleaned && options.verbose) {
      console.log(chalk.dim(`  cleaned: ${projectRoot}/.gitignore`));
    }
  }

  // Clear manifest (already done if we removed the directory)
  if (!result.clearedManifest && !options.dryRun) {
    await clearManifest();
    result.clearedManifest = true;
  }

  const action = options.dryRun ? "Would remove" : "Removed";
  console.log(
    chalk.green(
      `${action} ${result.removedFiles.length} file(s), backups, and manifest.`,
    ),
  );

  return result;
}
