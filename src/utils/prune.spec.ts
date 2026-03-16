import { describe, it, expect, vi, beforeEach } from "vitest";
import { findStaleCanonicalEntries } from "./prune.js";

vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    access: vi.fn(),
    rm: vi.fn(),
    rmdir: vi.fn(),
  },
}));

vi.mock("./fs.js", () => ({
  fileExists: vi.fn(),
}));

import fs from "node:fs/promises";
import { fileExists } from "./fs.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findStaleCanonicalEntries", () => {
  it("returns nothing when canonical root does not exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    const result = await findStaleCanonicalEntries("/fake/.agents");
    expect(result).toEqual([]);
  });

  it("returns nothing when only valid entries exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(fs.readdir).mockResolvedValue([
      "AGENTS.md",
      "skills",
      "mcp.json",
    ] as any);
    const result = await findStaleCanonicalEntries("/home/.agents");
    expect(result).toEqual([]);
  });

  it("detects stale directories like commands/", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(fs.readdir).mockResolvedValue([
      "AGENTS.md",
      "skills",
      "mcp.json",
      "commands",
    ] as any);
    const result = await findStaleCanonicalEntries("/home/.agents");
    expect(result).toEqual([
      {
        path: "/home/.agents/commands",
        reason: "not a recognized canonical asset directory",
      },
    ]);
  });

  it("ignores .bak and hidden files", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(fs.readdir).mockResolvedValue([
      "AGENTS.md",
      "skills",
      "mcp.json",
      "mcp.json.bak",
      ".gitkeep",
    ] as any);
    const result = await findStaleCanonicalEntries("/home/.agents");
    expect(result).toEqual([]);
  });

  it("detects multiple stale entries", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(fs.readdir).mockResolvedValue([
      "AGENTS.md",
      "commands",
      "prompts",
      "old-stuff",
    ] as any);
    const result = await findStaleCanonicalEntries("/home/.agents");
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.path)).toEqual([
      "/home/.agents/commands",
      "/home/.agents/prompts",
      "/home/.agents/old-stuff",
    ]);
  });
});
