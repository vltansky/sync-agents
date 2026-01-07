import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { fileExists, readFileSafe } from "./fs.js";
import { readManifest } from "./manifest.js";

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  exists: boolean;
}

export interface RevertResult {
  restored: string[];
  skipped: string[];
  failed: string[];
}

/**
 * Find all .bak files for files in the manifest.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  const manifest = await readManifest();
  const backups: BackupInfo[] = [];

  for (const filePath of manifest.generatedFiles) {
    const backupPath = `${filePath}.bak`;
    const exists = await fileExists(backupPath);
    backups.push({ originalPath: filePath, backupPath, exists });
  }

  return backups;
}

/**
 * Find backups that actually exist (can be restored).
 */
export async function listAvailableBackups(): Promise<BackupInfo[]> {
  const all = await listBackups();
  return all.filter((b) => b.exists);
}

/**
 * Revert files from their .bak backups.
 */
export async function performRevert(
  options: { dryRun?: boolean; verbose?: boolean; files?: string[] } = {},
): Promise<RevertResult> {
  const result: RevertResult = {
    restored: [],
    skipped: [],
    failed: [],
  };

  const available = await listAvailableBackups();

  if (available.length === 0) {
    console.log(chalk.yellow("No backups available to restore."));
    return result;
  }

  // Filter to specific files if requested
  const toRestore = options.files
    ? available.filter((b) =>
        options.files!.some(
          (f) => b.originalPath.includes(f) || b.backupPath.includes(f),
        ),
      )
    : available;

  if (toRestore.length === 0) {
    console.log(chalk.yellow("No matching backups found."));
    return result;
  }

  console.log(chalk.yellow(`Reverting ${toRestore.length} file(s)...`));

  for (const backup of toRestore) {
    if (options.dryRun) {
      console.log(chalk.dim(`  would restore: ${backup.originalPath}`));
      result.restored.push(backup.originalPath);
      continue;
    }

    try {
      // Read backup content
      const backupContent = await readFileSafe(backup.backupPath);
      if (!backupContent) {
        result.failed.push(backup.originalPath);
        continue;
      }

      // Write to original location
      await fs.mkdir(path.dirname(backup.originalPath), { recursive: true });
      await fs.writeFile(backup.originalPath, backupContent, "utf8");

      if (options.verbose) {
        console.log(chalk.dim(`  restored: ${backup.originalPath}`));
      }
      result.restored.push(backup.originalPath);
    } catch (err) {
      console.log(
        chalk.red(`  failed: ${backup.originalPath} - ${String(err)}`),
      );
      result.failed.push(backup.originalPath);
    }
  }

  const action = options.dryRun ? "Would restore" : "Restored";
  console.log(chalk.green(`${action} ${result.restored.length} file(s).`));

  if (result.failed.length > 0) {
    console.log(
      chalk.red(`Failed to restore ${result.failed.length} file(s).`),
    );
  }

  return result;
}

/**
 * Show available backups.
 */
export async function showBackupStatus(): Promise<void> {
  const available = await listAvailableBackups();

  if (available.length === 0) {
    console.log(chalk.yellow("No backups available."));
    return;
  }

  console.log(chalk.cyan(`Found ${available.length} backup(s):\n`));

  for (const backup of available) {
    console.log(`  ${backup.originalPath}`);
  }
}
