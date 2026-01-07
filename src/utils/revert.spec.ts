import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listBackups, listAvailableBackups } from "./revert.js";

describe("revert", () => {
  const testDir = path.join(os.tmpdir(), "sync-agents-revert-test");
  const manifestDir = path.join(os.homedir(), ".sync-agents");
  const manifestPath = path.join(manifestDir, "manifest.json");
  let originalManifest: string | null = null;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    // Save original manifest if it exists
    try {
      originalManifest = await fs.readFile(manifestPath, "utf8");
    } catch {
      originalManifest = null;
    }
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    // Restore original manifest
    if (originalManifest) {
      await fs.writeFile(manifestPath, originalManifest, "utf8");
    } else {
      try {
        await fs.unlink(manifestPath);
      } catch {
        // ignore
      }
    }
  });

  describe("listBackups", () => {
    it("returns empty array when no manifest exists", async () => {
      // Remove manifest if exists
      try {
        await fs.unlink(manifestPath);
      } catch {
        // ignore
      }

      const backups = await listBackups();
      expect(backups).toEqual([]);
    });

    it("returns backup info for files in manifest", async () => {
      const testFile = path.join(testDir, "test.md");
      const backupFile = `${testFile}.bak`;

      // Create files
      await fs.writeFile(testFile, "current content", "utf8");
      await fs.writeFile(backupFile, "backup content", "utf8");

      // Create manifest with test file
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        manifestPath,
        JSON.stringify({
          version: 1,
          lastSync: new Date().toISOString(),
          generatedFiles: [testFile],
        }),
        "utf8",
      );

      const backups = await listBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0]).toEqual({
        originalPath: testFile,
        backupPath: backupFile,
        exists: true,
      });
    });

    it("marks backup as not existing when .bak file missing", async () => {
      const testFile = path.join(testDir, "no-backup.md");
      await fs.writeFile(testFile, "content", "utf8");

      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        manifestPath,
        JSON.stringify({
          version: 1,
          lastSync: new Date().toISOString(),
          generatedFiles: [testFile],
        }),
        "utf8",
      );

      const backups = await listBackups();
      expect(backups).toHaveLength(1);
      expect(backups[0].exists).toBe(false);
    });
  });

  describe("listAvailableBackups", () => {
    it("filters to only existing backups", async () => {
      const fileWithBackup = path.join(testDir, "has-backup.md");
      const fileWithoutBackup = path.join(testDir, "no-backup.md");

      await fs.writeFile(fileWithBackup, "content", "utf8");
      await fs.writeFile(`${fileWithBackup}.bak`, "backup", "utf8");
      await fs.writeFile(fileWithoutBackup, "content", "utf8");

      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(
        manifestPath,
        JSON.stringify({
          version: 1,
          lastSync: new Date().toISOString(),
          generatedFiles: [fileWithBackup, fileWithoutBackup],
        }),
        "utf8",
      );

      const available = await listAvailableBackups();
      expect(available).toHaveLength(1);
      expect(available[0].originalPath).toBe(fileWithBackup);
    });
  });
});
