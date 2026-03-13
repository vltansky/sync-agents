import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_STORE_DIR = path.join(os.homedir(), ".link-agents", "snapshots");

interface SnapshotFileEntry {
  path: string;
  state: "missing" | "file" | "symlink";
  dataFile?: string;
  linkTarget?: string;
}

export interface SnapshotManifest {
  id: string;
  createdAt: string;
  entries: SnapshotFileEntry[];
}

interface SnapshotStoreOptions {
  storeDir?: string;
}

export async function createSnapshot(
  targetPaths: string[],
  options: SnapshotStoreOptions = {},
): Promise<SnapshotManifest> {
  const storeDir = options.storeDir ?? DEFAULT_STORE_DIR;
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const dir = snapshotDirForId(id, storeDir);
  const filesDir = path.join(dir, "files");

  await fs.mkdir(filesDir, { recursive: true });

  const entries: SnapshotFileEntry[] = [];

  for (const [index, targetPath] of targetPaths.entries()) {
    try {
      const stats = await fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        entries.push({
          path: targetPath,
          state: "symlink",
          linkTarget: await fs.readlink(targetPath),
        });
        continue;
      }

      const dataFile = `file-${index}.txt`;
      await fs.writeFile(
        path.join(filesDir, dataFile),
        await fs.readFile(targetPath, "utf8"),
        "utf8",
      );
      entries.push({ path: targetPath, state: "file", dataFile });
    } catch {
      entries.push({ path: targetPath, state: "missing" });
    }
  }

  const manifest: SnapshotManifest = {
    id,
    createdAt: new Date().toISOString(),
    entries,
  };

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return manifest;
}

export async function listSnapshots(
  options: SnapshotStoreOptions = {},
): Promise<SnapshotManifest[]> {
  const storeDir = options.storeDir ?? DEFAULT_STORE_DIR;

  try {
    const entries = await fs.readdir(storeDir, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => readSnapshot(entry.name, { storeDir })),
    );

    return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function readSnapshot(
  snapshotId: string,
  options: SnapshotStoreOptions = {},
): Promise<SnapshotManifest> {
  const storeDir = options.storeDir ?? DEFAULT_STORE_DIR;
  const dir = snapshotDirForId(snapshotId, storeDir);
  const content = await fs.readFile(path.join(dir, "manifest.json"), "utf8");
  return JSON.parse(content) as SnapshotManifest;
}

export async function restoreSnapshot(
  snapshotId: string,
  options: SnapshotStoreOptions = {},
): Promise<SnapshotManifest> {
  const storeDir = options.storeDir ?? DEFAULT_STORE_DIR;
  const dir = snapshotDirForId(snapshotId, storeDir);
  const manifest = await readSnapshot(snapshotId, { storeDir });

  for (const entry of manifest.entries) {
    await fs.rm(entry.path, { recursive: true, force: true });

    if (entry.state === "missing") {
      continue;
    }

    await fs.mkdir(path.dirname(entry.path), { recursive: true });

    if (entry.state === "symlink") {
      await fs.symlink(entry.linkTarget!, entry.path);
      continue;
    }

    const filePath = path.join(dir, "files", entry.dataFile!);
    await fs.writeFile(entry.path, await fs.readFile(filePath, "utf8"), "utf8");
  }

  return manifest;
}

export function snapshotDirForId(
  snapshotId: string,
  storeDir = DEFAULT_STORE_DIR,
): string {
  return path.join(storeDir, snapshotId);
}
