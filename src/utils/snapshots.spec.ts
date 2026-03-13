import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  snapshotDirForId,
} from "./snapshots.js";

describe("snapshots", () => {
  const root = path.join(os.tmpdir(), "agsync-snapshots-test");
  const targetsDir = path.join(root, "targets");
  const storeDir = path.join(root, "store");

  beforeEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(targetsDir, { recursive: true });
    await fs.mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("captures file, symlink, and missing states and restores them", async () => {
    const filePath = path.join(targetsDir, "file.md");
    const sourcePath = path.join(targetsDir, "source.md");
    const linkPath = path.join(targetsDir, "link.md");
    const missingPath = path.join(targetsDir, "missing.md");

    await fs.writeFile(filePath, "before", "utf8");
    await fs.writeFile(sourcePath, "source", "utf8");
    await fs.symlink("source.md", linkPath);

    const snapshot = await createSnapshot([filePath, linkPath, missingPath], {
      storeDir,
    });

    await fs.writeFile(filePath, "after", "utf8");
    await fs.rm(linkPath, { force: true });
    await fs.writeFile(linkPath, "flattened", "utf8");
    await fs.writeFile(missingPath, "new file", "utf8");

    await restoreSnapshot(snapshot.id, { storeDir });

    expect(await fs.readFile(filePath, "utf8")).toBe("before");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readlink(linkPath)).toBe("source.md");
    await expect(fs.access(missingPath)).rejects.toThrow();
  });

  it("lists snapshots by newest first", async () => {
    const filePath = path.join(targetsDir, "file.md");
    await fs.writeFile(filePath, "content", "utf8");

    const first = await createSnapshot([filePath], { storeDir });
    const second = await createSnapshot([filePath], { storeDir });

    const listed = await listSnapshots({ storeDir });
    expect(listed[0].id).toBe(second.id);
    expect(listed[1].id).toBe(first.id);
  });

  it("stores snapshot manifests under the snapshot directory", async () => {
    const filePath = path.join(targetsDir, "file.md");
    await fs.writeFile(filePath, "content", "utf8");

    const snapshot = await createSnapshot([filePath], { storeDir });
    const manifestPath = path.join(
      snapshotDirForId(snapshot.id, storeDir),
      "manifest.json",
    );

    expect(await fs.readFile(manifestPath, "utf8")).toContain(filePath);
  });
});
