import chalk from "chalk";
import { fileExists, readFileSafe, writeFileSafe } from "./fs.js";
import { readManifest } from "./manifest.js";

export interface BackupInfo {
  originalPath: string;
  backupPath: string;
  exists: boolean;
}

export interface RevertResult {
  restored: string[];
  failed: string[];
}

/**
 * Find all .bak files for files in the manifest.
 */
export async function listBackups(): Promise<BackupInfo[]> {
  const manifest = await readManifest();

  const backups = await Promise.all(
    manifest.generatedFiles.map(async (filePath) => {
      const backupPath = `${filePath}.bak`;
      const exists = await fileExists(backupPath);
      return { originalPath: filePath, backupPath, exists };
    }),
  );

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
      const backupContent = await readFileSafe(backup.backupPath);
      if (!backupContent) {
        result.failed.push(backup.originalPath);
        continue;
      }

      await writeFileSafe(backup.originalPath, backupContent);

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
