import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  note: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn().mockResolvedValue("symlink"),
  isCancel: vi.fn().mockReturnValue(false),
  spinner: () => ({
    start: vi.fn(),
    stop: vi.fn(),
  }),
  log: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
  },
}));

describe("runSyncCommand e2e", () => {
  const originalHome = process.env.HOME;
  const originalStdoutTty = process.stdout.isTTY;
  const originalStdinTty = process.stdin.isTTY;
  let testRoot: string;

  beforeEach(async () => {
    testRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "link-agents-sync-e2e-"),
    );
    process.env.HOME = testRoot;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutTty,
    });
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: originalStdinTty,
    });
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it("collects the newer Claude AGENTS into canonical and links Claude by default", async () => {
    const canonicalPath = path.join(testRoot, ".agents", "AGENTS.md");
    const claudeDir = path.join(testRoot, ".claude");
    const claudePath = path.join(claudeDir, "CLAUDE.md");

    await fs.mkdir(path.dirname(canonicalPath), { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(canonicalPath, "old canonical", "utf8");
    await fs.writeFile(claudePath, "new from claude", "utf8");
    await setMtime(canonicalPath, new Date("2026-01-01T00:00:00Z"));
    await setMtime(claudePath, new Date("2026-02-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    expect(await fs.readFile(canonicalPath, "utf8")).toBe("new from claude");

    const claudeStats = await fs.lstat(claudePath);
    expect(claudeStats.isSymbolicLink()).toBe(true);
    expect(
      path.resolve(path.dirname(claudePath), await fs.readlink(claudePath)),
    ).toBe(canonicalPath);
  });

  it("falls back to a copy when Claude target bytes differ from canonical", async () => {
    const claudeDir = path.join(testRoot, ".claude");
    const canonicalSkill = path.join(
      testRoot,
      ".agents",
      "skills",
      "review",
      "SKILL.md",
    );
    const claudeSkill = path.join(claudeDir, "skills", "review", "SKILL.md");

    await fs.mkdir(path.dirname(canonicalSkill), { recursive: true });
    await fs.mkdir(path.dirname(claudeSkill), { recursive: true });
    await fs.writeFile(
      canonicalSkill,
      [
        "---",
        "description: Review changes",
        "argument-hint: [path]",
        "model: opus",
        "---",
        "",
        "# Review",
      ].join("\n"),
      "utf8",
    );
    await fs.writeFile(claudeSkill, "older", "utf8");
    await setMtime(canonicalSkill, new Date("2026-02-01T00:00:00Z"));
    await setMtime(claudeSkill, new Date("2026-01-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    const stats = await fs.lstat(claudeSkill);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(await fs.readFile(claudeSkill, "utf8")).not.toContain(
      "argument-hint",
    );
    expect(await fs.readFile(claudeSkill, "utf8")).not.toContain("model:");
  });

  it("keeps unmanaged canonical content instead of pruning it", async () => {
    const claudeDir = path.join(testRoot, ".claude");
    const canonicalAgents = path.join(testRoot, ".agents", "AGENTS.md");
    const extraFile = path.join(testRoot, ".agents", "commands", "keep.md");

    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(path.dirname(extraFile), { recursive: true });
    await fs.writeFile(canonicalAgents, "canonical", "utf8");
    await fs.writeFile(path.join(claudeDir, "CLAUDE.md"), "older", "utf8");
    await fs.writeFile(extraFile, "do not prune", "utf8");
    await setMtime(canonicalAgents, new Date("2026-02-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    expect(await fs.readFile(extraFile, "utf8")).toBe("do not prune");
  });

  it("collects a Claude-only skill into canonical and fans it out to Codex", async () => {
    const claudeDir = path.join(testRoot, ".claude");
    const codexDir = path.join(testRoot, ".codex");
    const claudeSkill = path.join(claudeDir, "skills", "lint", "SKILL.md");
    const canonicalSkill = path.join(
      testRoot,
      ".agents",
      "skills",
      "lint",
      "SKILL.md",
    );
    const codexSkill = path.join(codexDir, "skills", "lint", "SKILL.md");

    await fs.mkdir(path.dirname(claudeSkill), { recursive: true });
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      claudeSkill,
      ["---", "description: lint", "---", "", "# Lint"].join("\n"),
      "utf8",
    );
    await setMtime(claudeSkill, new Date("2026-03-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    expect(await fs.readFile(canonicalSkill, "utf8")).toContain("# Lint");
    expect((await fs.lstat(codexSkill)).isSymbolicLink()).toBe(true);
    expect(
      path.resolve(path.dirname(codexSkill), await fs.readlink(codexSkill)),
    ).toBe(canonicalSkill);
  });

  it("uses the newest asset across multiple clients and fans out that winner", async () => {
    const canonicalPath = path.join(testRoot, ".agents", "AGENTS.md");
    const claudeDir = path.join(testRoot, ".claude");
    const cursorDir = path.join(testRoot, ".cursor");
    const codexDir = path.join(testRoot, ".codex");
    const claudePath = path.join(claudeDir, "CLAUDE.md");
    const cursorPath = path.join(cursorDir, "AGENTS.md");
    const codexPath = path.join(codexDir, "AGENTS.md");

    await fs.mkdir(path.dirname(canonicalPath), { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(cursorDir, { recursive: true });
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(canonicalPath, "canonical old", "utf8");
    await fs.writeFile(claudePath, "claude middle", "utf8");
    await fs.writeFile(cursorPath, "cursor newest", "utf8");
    await setMtime(canonicalPath, new Date("2026-01-01T00:00:00Z"));
    await setMtime(claudePath, new Date("2026-02-01T00:00:00Z"));
    await setMtime(cursorPath, new Date("2026-03-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    expect(await fs.readFile(canonicalPath, "utf8")).toBe("cursor newest");
    expect((await fs.lstat(claudePath)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(cursorPath)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(codexPath)).isSymbolicLink()).toBe(true);
  });

  it("merges MCP servers across clients into canonical and writes client-specific copies", async () => {
    const claudeDir = path.join(testRoot, ".claude");
    const codexDir = path.join(testRoot, ".codex");
    const canonicalMcp = path.join(testRoot, ".agents", "mcp.json");
    const claudeMcp = path.join(testRoot, ".claude.json");
    const codexMcp = path.join(codexDir, "config.toml");

    await fs.mkdir(path.dirname(canonicalMcp), { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(
      canonicalMcp,
      JSON.stringify(
        {
          mcpServers: {
            canonicalServer: { command: "node", args: ["canonical"] },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      claudeMcp,
      JSON.stringify(
        {
          mcpServers: {
            claudeServer: { command: "npx", args: ["claude"] },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await setMtime(canonicalMcp, new Date("2026-01-01T00:00:00Z"));
    await setMtime(claudeMcp, new Date("2026-02-01T00:00:00Z"));

    const { runSyncCommand } = await import("./sync.js");
    await runSyncCommand({
      command: "sync",
      root: testRoot,
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      types: undefined,
    });

    const canonicalParsed = JSON.parse(await fs.readFile(canonicalMcp, "utf8"));
    expect(Object.keys(canonicalParsed.mcpServers).sort()).toEqual([
      "canonicalServer",
      "claudeServer",
    ]);

    expect((await fs.lstat(claudeMcp)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(codexMcp, "utf8")).toContain(
      "[mcp_servers.canonicalServer]",
    );
    expect(await fs.readFile(codexMcp, "utf8")).toContain(
      "[mcp_servers.claudeServer]",
    );
  });

  it("restores the previous state when sync fails mid-run", async () => {
    const canonicalPath = path.join(testRoot, ".agents", "AGENTS.md");
    const claudeDir = path.join(testRoot, ".claude");
    const codexDir = path.join(testRoot, ".codex");
    const claudePath = path.join(claudeDir, "CLAUDE.md");
    const codexPath = path.join(codexDir, "AGENTS.md");

    await fs.mkdir(path.dirname(canonicalPath), { recursive: true });
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(canonicalPath, "canonical old", "utf8");
    await fs.writeFile(claudePath, "claude newest", "utf8");
    await fs.writeFile(codexPath, "codex old", "utf8");
    await fs.chmod(codexPath, 0o400);
    await setMtime(canonicalPath, new Date("2026-01-01T00:00:00Z"));
    await setMtime(claudePath, new Date("2026-02-01T00:00:00Z"));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw new Error(`process.exit:${code ?? ""}`);
    }) as never);

    try {
      const { runSyncCommand } = await import("./sync.js");
      await expect(
        runSyncCommand({
          command: "sync",
          root: testRoot,
          dryRun: false,
          verbose: false,
          link: false,
          copy: false,
          types: undefined,
        }),
      ).rejects.toThrow(/process\.exit:1/);
    } finally {
      exitSpy.mockRestore();
      await fs.chmod(codexPath, 0o644).catch(() => undefined);
    }

    expect(await fs.readFile(canonicalPath, "utf8")).toBe("canonical old");
    expect((await fs.lstat(claudePath)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(claudePath, "utf8")).toBe("claude newest");
    expect(await fs.readFile(codexPath, "utf8")).toBe("codex old");
  });
});

async function setMtime(filePath: string, time: Date): Promise<void> {
  await fs.utimes(filePath, time, time);
}
