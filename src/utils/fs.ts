import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function writeFileSafe(
  filePath: string,
  contents: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, "utf8");
}

export function hashContent(content: string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

export function expandHome(inputPath: string): string {
  if (inputPath.startsWith("~")) {
    return path.join(process.env.HOME ?? "", inputPath.slice(1));
  }
  return inputPath;
}

export function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

export async function getFileMtime(filePath: string): Promise<Date | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

/**
 * Create a symlink, removing existing file/symlink if present.
 * Creates parent directories as needed.
 */
export async function createSymlink(
  targetPath: string,
  linkPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(linkPath), { recursive: true });

  // Remove existing file or symlink
  try {
    const stats = await fs.lstat(linkPath);
    if (stats.isSymbolicLink() || stats.isFile()) {
      await fs.unlink(linkPath);
    }
  } catch {
    // File doesn't exist, that's fine
  }

  await fs.symlink(targetPath, linkPath);
}

/**
 * Check if a path is a symlink
 */
export async function isSymlink(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get the target of a symlink
 */
export async function getSymlinkTarget(
  filePath: string,
): Promise<string | null> {
  try {
    return await fs.readlink(filePath);
  } catch {
    return null;
  }
}

/**
 * Create a backup of a file by copying it to .bak
 * Returns the backup path if created, null if file didn't exist
 */
export async function createBackup(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
    const backupPath = `${filePath}.bak`;
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Restore a file from its backup
 * Returns true if restored, false if backup didn't exist or failed
 */
export async function restoreBackup(
  backupPath: string,
  targetPath: string,
): Promise<boolean> {
  try {
    await fs.access(backupPath);
    await fs.copyFile(backupPath, targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file content matches expected hash
 */
export async function verifyFileHash(
  filePath: string,
  expectedContent: string,
): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return hashContent(content) === hashContent(expectedContent);
  } catch {
    return false;
  }
}

/**
 * Check if a command exists in PATH
 * Uses execFile to avoid shell injection
 */
export async function commandExists(command: string): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    await execFileAsync(whichCmd, [command]);
    return true;
  } catch {
    return false;
  }
}
