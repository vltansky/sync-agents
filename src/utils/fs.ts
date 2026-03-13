import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
