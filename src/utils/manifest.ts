import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileExists, readFileSafe } from "./fs.js";

const MANIFEST_DIR = path.join(os.homedir(), ".sync-agents");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.json");

interface Manifest {
  version: 1;
  lastSync: string;
  generatedFiles: string[];
}

function createEmptyManifest(): Manifest {
  return {
    version: 1,
    lastSync: new Date().toISOString(),
    generatedFiles: [],
  };
}

export async function readManifest(): Promise<Manifest> {
  const content = await readFileSafe(MANIFEST_PATH);
  if (!content) {
    return createEmptyManifest();
  }
  try {
    return JSON.parse(content) as Manifest;
  } catch {
    return createEmptyManifest();
  }
}

export async function writeManifest(manifest: Manifest): Promise<void> {
  await fs.mkdir(MANIFEST_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

export async function updateManifest(generatedFiles: string[]): Promise<void> {
  const manifest: Manifest = {
    version: 1,
    lastSync: new Date().toISOString(),
    generatedFiles: [...new Set(generatedFiles)].sort(),
  };
  await writeManifest(manifest);
}

/**
 * Find files that were in the previous manifest but not in the current plan.
 * These are "stale" files that should be cleaned up.
 */
export async function findStaleFiles(
  currentFiles: string[],
): Promise<string[]> {
  const manifest = await readManifest();
  const currentSet = new Set(currentFiles);

  const staleFiles: string[] = [];
  for (const file of manifest.generatedFiles) {
    if (!currentSet.has(file) && (await fileExists(file))) {
      staleFiles.push(file);
    }
  }
  return staleFiles;
}

/**
 * Remove stale files that are no longer in the sync plan.
 * Returns list of removed files.
 */
export async function pruneStaleFiles(
  currentFiles: string[],
): Promise<string[]> {
  const staleFiles = await findStaleFiles(currentFiles);
  const removed: string[] = [];

  for (const file of staleFiles) {
    try {
      await fs.unlink(file);
      removed.push(file);
    } catch {
      // File may have been manually deleted
    }
  }

  return removed;
}

/**
 * Clear the manifest (used by reset command).
 */
export async function clearManifest(): Promise<void> {
  try {
    await fs.unlink(MANIFEST_PATH);
  } catch {
    // File doesn't exist
  }
}

/**
 * Get all files from manifest (for reset command).
 */
export async function getManifestFiles(): Promise<string[]> {
  const manifest = await readManifest();
  return manifest.generatedFiles;
}
