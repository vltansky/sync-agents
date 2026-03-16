import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const BACKUP_PREFIX = "__SYNC_AGENTS_BACKUP_V1__\n";

interface BackupPayload {
  kind: "file" | "symlink";
  content?: string;
  linkTarget?: string;
}

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
    const content = await fs.readFile(filePath, "utf8");
    // Strip UTF-8 BOM — prevents frontmatter detection failures and
    // double-frontmatter injection on files saved by Windows editors.
    if (content.charCodeAt(0) === 0xfeff) {
      return content.slice(1);
    }
    return content;
  } catch {
    return null;
  }
}

export async function writeFileSafe(
  filePath: string,
  contents: string,
): Promise<void> {
  await breakParentDirSymlinks(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Remove existing symlink to avoid ELOOP and prevent writing through to
  // the symlink target (which would modify a different client's file).
  try {
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
      await fs.unlink(filePath);
    }
  } catch {
    // File doesn't exist — nothing to unlink
  }
  await fs.writeFile(filePath, contents, "utf8");
}

/**
 * Break directory symlinks in the ancestor chain of filePath to prevent
 * writing through them into a different location (e.g. a client dir symlink
 * pointing to canonical would cause writes to modify canonical files).
 * Walks upward from the immediate parent, stopping at HOME or filesystem root.
 */
async function breakParentDirSymlinks(filePath: string): Promise<void> {
  const home = process.env.HOME ?? "/";
  let dir = path.dirname(filePath);

  while (dir !== home && dir !== "/" && dir !== path.dirname(dir)) {
    try {
      const stats = await fs.lstat(dir);
      if (stats.isSymbolicLink()) {
        await fs.unlink(dir);
        await fs.mkdir(dir, { recursive: true });
      }
    } catch {
      // Dir doesn't exist yet — will be created by mkdir later
    }
    dir = path.dirname(dir);
  }
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

export async function getFileMtime(filePath: string): Promise<Date | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime;
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
    const backupPath = `${filePath}.bak`;
    const stats = await fs.lstat(filePath);

    if (stats.isSymbolicLink()) {
      const linkTarget = await fs.readlink(filePath);
      await fs.writeFile(
        backupPath,
        serializeBackupPayload({ kind: "symlink", linkTarget }),
        "utf8",
      );
      return backupPath;
    }

    const content = await fs.readFile(filePath, "utf8");
    await fs.writeFile(
      backupPath,
      serializeBackupPayload({ kind: "file", content }),
      "utf8",
    );
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
    const backupContent = await fs.readFile(backupPath, "utf8");
    const payload = parseBackupPayload(backupContent);

    if (!payload) {
      await writeFileSafe(targetPath, backupContent);
      return true;
    }

    await fs.rm(targetPath, { force: true, recursive: true });

    if (payload.kind === "symlink" && payload.linkTarget) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.symlink(payload.linkTarget, targetPath);
      return true;
    }

    await writeFileSafe(targetPath, payload.content ?? "");
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

function serializeBackupPayload(payload: BackupPayload): string {
  return `${BACKUP_PREFIX}${JSON.stringify(payload)}`;
}

function parseBackupPayload(content: string): BackupPayload | null {
  if (!content.startsWith(BACKUP_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(content.slice(BACKUP_PREFIX.length)) as BackupPayload;
  } catch {
    return null;
  }
}
