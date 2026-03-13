import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { buildClientDefinitions, CLIENT_ORDER } from "./definitions.js";

const HOME = os.homedir();

describe("buildClientDefinitions", () => {
  const projectRoot = "/test/project";

  describe("client order", () => {
    it("should include only supported clients", () => {
      expect(CLIENT_ORDER).toEqual([
        "project",
        "codex",
        "claude",
        "cursor",
        "opencode",
      ]);
    });
  });

  describe("project client", () => {
    it("should have correct root path", () => {
      const defs = buildClientDefinitions(projectRoot);
      const project = defs.find((d) => d.name === "project");
      expect(project?.root).toBe(projectRoot);
    });

    it("should support all asset types", () => {
      const defs = buildClientDefinitions(projectRoot);
      const project = defs.find((d) => d.name === "project");
      const types = project?.assets.map((a) => a.type);
      expect(types).toContain("agents");
      expect(types).toContain("commands");
      expect(types).toContain("rules");
      expect(types).toContain("skills");
      expect(types).toContain("mcp");
    });
  });

  describe("codex client", () => {
    it("should have root at ~/.codex", () => {
      const defs = buildClientDefinitions(projectRoot);
      const codex = defs.find((d) => d.name === "codex");
      expect(codex?.root).toBe(path.join(HOME, ".codex"));
    });

    it("should support both legacy prompts and migrated command skills for Codex", () => {
      const defs = buildClientDefinitions(projectRoot);
      const codex = defs.find((d) => d.name === "codex");
      const commands = codex?.assets.find((a) => a.type === "commands");
      const skills = codex?.assets.find((a) => a.type === "skills");
      expect(commands?.patterns).toContain("prompts/**/*.md");
      expect(commands?.patterns).toContain("skills/commands/**/SKILL.md");
      expect(skills?.patterns).toContain("!skills/commands/**/SKILL.md");
    });

    it("should use config.toml for MCP", () => {
      const defs = buildClientDefinitions(projectRoot);
      const codex = defs.find((d) => d.name === "codex");
      const mcp = codex?.assets.find((a) => a.type === "mcp");
      expect(mcp?.files).toContain("config.toml");
    });
  });

  describe("claude client", () => {
    it("should have root at ~/.claude", () => {
      const defs = buildClientDefinitions(projectRoot);
      const claude = defs.find((d) => d.name === "claude");
      expect(claude?.root).toBe(path.join(HOME, ".claude"));
    });

    it("should use CLAUDE.md for agents", () => {
      const defs = buildClientDefinitions(projectRoot);
      const claude = defs.find((d) => d.name === "claude");
      const agents = claude?.assets.find((a) => a.type === "agents");
      expect(agents?.patterns).toContain("CLAUDE.md");
    });

    it("should have commands in commands/ directory", () => {
      const defs = buildClientDefinitions(projectRoot);
      const claude = defs.find((d) => d.name === "claude");
      const commands = claude?.assets.find((a) => a.type === "commands");
      expect(commands?.patterns).toContain("commands/**/*.md");
    });

    it("should NOT have rules directory (rules are in CLAUDE.md)", () => {
      const defs = buildClientDefinitions(projectRoot);
      const claude = defs.find((d) => d.name === "claude");
      const rules = claude?.assets.find((a) => a.type === "rules");
      expect(rules?.patterns).toEqual([]);
    });

    it("should NOT have skills directory", () => {
      const defs = buildClientDefinitions(projectRoot);
      const claude = defs.find((d) => d.name === "claude");
      const skills = claude?.assets.find((a) => a.type === "skills");
      expect(skills?.patterns).toEqual([]);
    });
  });

  describe("cursor client", () => {
    it("should have root at ~/.cursor", () => {
      const defs = buildClientDefinitions(projectRoot);
      const cursor = defs.find((d) => d.name === "cursor");
      expect(cursor?.root).toBe(path.join(HOME, ".cursor"));
    });

    it("should use AGENTS.md for agents", () => {
      const defs = buildClientDefinitions(projectRoot);
      const cursor = defs.find((d) => d.name === "cursor");
      const agents = cursor?.assets.find((a) => a.type === "agents");
      expect(agents?.patterns).toContain("AGENTS.md");
    });

    it("should support .md and .mdc rules", () => {
      const defs = buildClientDefinitions(projectRoot);
      const cursor = defs.find((d) => d.name === "cursor");
      const rules = cursor?.assets.find((a) => a.type === "rules");
      expect(rules?.patterns).toContain("rules/**/*.md");
      expect(rules?.patterns).toContain("rules/**/*.mdc");
    });

    it("should use mcp.json for MCP", () => {
      const defs = buildClientDefinitions(projectRoot);
      const cursor = defs.find((d) => d.name === "cursor");
      const mcp = cursor?.assets.find((a) => a.type === "mcp");
      expect(mcp?.files).toContain("mcp.json");
    });
  });

  describe("opencode client", () => {
    // See: https://opencode.ai/docs/rules/
    it("should have root at ~/.config/opencode (XDG config dir)", () => {
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      // OpenCode follows XDG spec: ~/.config/opencode/
      const expectedRoot = path.join(HOME, ".config", "opencode");
      expect(opencode?.root).toBe(expectedRoot);
    });

    it("should use AGENTS.md for agents (same as Cursor)", () => {
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      const agents = opencode?.assets.find((a) => a.type === "agents");
      expect(agents?.patterns).toContain("AGENTS.md");
    });

    it("should use singular command/ directory (not commands/)", () => {
      // See: https://opencode.ai/docs/commands/
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      const commands = opencode?.assets.find((a) => a.type === "commands");
      expect(commands?.patterns).toContain("command/**/*.md");
    });

    it("should NOT have rules directory (rules are in AGENTS.md)", () => {
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      const rules = opencode?.assets.find((a) => a.type === "rules");
      expect(rules?.patterns).toEqual([]);
    });

    it("should use singular skill/ directory (via oh-my-opencode)", () => {
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      const skills = opencode?.assets.find((a) => a.type === "skills");
      // OpenCode uses singular: skill/ not skills/
      expect(skills?.patterns).toContain("skill/**/SKILL.md");
    });

    it("should use opencode.json for MCP config", () => {
      const defs = buildClientDefinitions(projectRoot);
      const opencode = defs.find((d) => d.name === "opencode");
      const mcp = opencode?.assets.find((a) => a.type === "mcp");
      expect(mcp?.files).toContain("opencode.json");
    });
  });
});
