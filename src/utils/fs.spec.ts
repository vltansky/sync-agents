import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  hashContent,
  commandExists,
  createBackup,
  restoreBackup,
  readFileSafe,
} from "./fs.js";

describe("fs utilities", () => {
  const testDir = path.join(os.tmpdir(), "sync-agents-fs-test");

  beforeEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("hashContent", () => {
    it("should generate consistent hashes for same content", () => {
      const content = "test content";
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different content", () => {
      const hash1 = hashContent("content 1");
      const hash2 = hashContent("content 2");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty strings", () => {
      const hash = hashContent("");
      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(40);
    });
  });

  describe("commandExists", () => {
    it("should return true for common commands", async () => {
      // 'node' should exist since we're running in Node.js
      const exists = await commandExists("node");
      expect(exists).toBe(true);
    });

    it("should return false for non-existent commands", async () => {
      const exists = await commandExists("definitely-not-a-real-command-12345");
      expect(exists).toBe(false);
    });
  });

  describe("backup and restore", () => {
    it("restores regular files from backup payloads", async () => {
      const filePath = path.join(testDir, "agent.md");
      await fs.writeFile(filePath, "original content", "utf8");

      const backupPath = await createBackup(filePath);
      expect(backupPath).toBe(`${filePath}.bak`);

      await fs.writeFile(filePath, "changed content", "utf8");

      const restored = await restoreBackup(backupPath!, filePath);
      expect(restored).toBe(true);
      expect(await readFileSafe(filePath)).toBe("original content");
    });

    it("restores symlinks from backup payloads", async () => {
      const sourcePath = path.join(testDir, "source.md");
      const targetPath = path.join(testDir, "target.md");

      await fs.writeFile(sourcePath, "source content", "utf8");
      await fs.symlink("source.md", targetPath);

      const backupPath = await createBackup(targetPath);
      expect(backupPath).toBe(`${targetPath}.bak`);

      await fs.rm(targetPath, { force: true });
      await fs.writeFile(targetPath, "now a regular file", "utf8");

      const restored = await restoreBackup(backupPath!, targetPath);
      expect(restored).toBe(true);

      const stats = await fs.lstat(targetPath);
      expect(stats.isSymbolicLink()).toBe(true);
      expect(await fs.readlink(targetPath)).toBe("source.md");
    });
  });
});
