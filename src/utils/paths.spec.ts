import { describe, it, expect } from "vitest";
import type { AssetContent, ClientDefinition } from "../types/index.js";
import {
  normalizeRelativePath,
  canonicalizeRelativePath,
  denormalizeRelativePath,
  buildTargetAbsolutePath,
  resolveTargetRelativePath,
  remapRelativePathForTarget,
  getTargetMcpFilename,
  canonicalizeMcpPath,
  denormalizeMcpPath,
  flattenSkillPath,
} from "./paths.js";

const mockDefs: ClientDefinition[] = [
  {
    name: "codex",
    displayName: "Codex",
    root: "/home/.codex",
    assets: [
      { type: "agents", patterns: ["AGENTS.md"] },
      { type: "mcp", patterns: [], files: ["config.toml"] },
    ],
  },
  {
    name: "cursor",
    displayName: "Cursor",
    root: "/home/.cursor",
    assets: [
      { type: "agents", patterns: ["AGENTS.md"] },
      { type: "mcp", patterns: [], files: ["mcp.json"] },
    ],
  },
  {
    name: "opencode",
    displayName: "OpenCode",
    root: "/home/.config/opencode",
    assets: [
      { type: "agents", patterns: ["AGENTS.md"] },
      { type: "skills", patterns: ["skill/**/SKILL.md"] },
      { type: "mcp", patterns: [], files: ["opencode.json"] },
    ],
  },
];

describe("path utilities", () => {
  describe("normalizeRelativePath", () => {
    it("should convert Windows backslashes to forward slashes", () => {
      expect(normalizeRelativePath("rules\\test.md")).toBe("rules/test.md");
    });

    it("should handle mixed separators", () => {
      expect(normalizeRelativePath("commands/sub\\nested.md")).toBe(
        "commands/sub/nested.md",
      );
    });

    it("should preserve forward slashes", () => {
      expect(normalizeRelativePath("skills/test/SKILL.md")).toBe(
        "skills/test/SKILL.md",
      );
    });
  });

  describe("canonicalizeRelativePath", () => {
    it("should normalize claude.md to AGENTS.md for agents type", () => {
      expect(canonicalizeRelativePath("claude", "agents", "CLAUDE.md")).toBe(
        "AGENTS.md",
      );
    });

    it("should normalize claude.md to AGENTS.md (case insensitive)", () => {
      expect(canonicalizeRelativePath("claude", "agents", "claude.md")).toBe(
        "AGENTS.md",
      );
    });

    it("should preserve AGENTS.md for agents type", () => {
      expect(canonicalizeRelativePath("claude", "agents", "AGENTS.md")).toBe(
        "AGENTS.md",
      );
    });
  });

  describe("denormalizeRelativePath", () => {
    it("should convert AGENTS.md to CLAUDE.md for claude client", () => {
      expect(denormalizeRelativePath("claude", "agents", "AGENTS.md")).toBe(
        "CLAUDE.md",
      );
    });

    it("should preserve AGENTS.md for other clients", () => {
      expect(denormalizeRelativePath("cursor", "agents", "AGENTS.md")).toBe(
        "AGENTS.md",
      );
    });
  });

  describe("buildTargetAbsolutePath", () => {
    it("should join root and relative path", () => {
      expect(buildTargetAbsolutePath("/root", "rules/test.md")).toBe(
        "/root/rules/test.md",
      );
    });

    it("should handle empty segments", () => {
      expect(buildTargetAbsolutePath("/root", "test.md")).toBe("/root/test.md");
    });
  });

  describe("remapRelativePathForTarget", () => {
    it("should remap MCP config.toml to mcp.json for cursor", () => {
      const asset: AssetContent = {
        client: "codex",
        type: "mcp",
        path: "/codex/config.toml",
        relativePath: "config.toml",
        canonicalPath: "mcp.json",
        name: "config",
        content: "[mcpServers]",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(asset, "cursor", "mcp.json", mockDefs),
      ).toBe("mcp.json");
    });

    it("should remap MCP to opencode.json for opencode", () => {
      const asset: AssetContent = {
        client: "cursor",
        type: "mcp",
        path: "/cursor/mcp.json",
        relativePath: "mcp.json",
        canonicalPath: "mcp.json",
        name: "mcp",
        content: "{}",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(asset, "opencode", "mcp.json", mockDefs),
      ).toBe("opencode.json");
    });

    it("should remap MCP to config.toml for codex", () => {
      const asset: AssetContent = {
        client: "cursor",
        type: "mcp",
        path: "/cursor/mcp.json",
        relativePath: "mcp.json",
        canonicalPath: "mcp.json",
        name: "mcp",
        content: "{}",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(asset, "codex", "mcp.json", mockDefs),
      ).toBe("config.toml");
    });
  });

  describe("canonicalizeMcpPath", () => {
    it("should canonicalize config.toml to mcp.json", () => {
      expect(canonicalizeMcpPath("config.toml")).toBe("mcp.json");
    });

    it("should canonicalize opencode.jsonc to mcp.json", () => {
      expect(canonicalizeMcpPath("opencode.jsonc")).toBe("mcp.json");
    });
  });

  describe("getTargetMcpFilename", () => {
    it("should return config.toml for codex", () => {
      expect(getTargetMcpFilename("codex", mockDefs)).toBe("config.toml");
    });

    it("should return mcp.json for cursor", () => {
      expect(getTargetMcpFilename("cursor", mockDefs)).toBe("mcp.json");
    });

    it("should return opencode.json for opencode", () => {
      expect(getTargetMcpFilename("opencode", mockDefs)).toBe("opencode.json");
    });

    it("should return null for unknown client", () => {
      expect(getTargetMcpFilename("unknown" as any, mockDefs)).toBeNull();
    });
  });

  describe("denormalizeMcpPath", () => {
    it("should return client-specific MCP filename", () => {
      expect(denormalizeMcpPath("codex", mockDefs)).toBe("config.toml");
      expect(denormalizeMcpPath("cursor", mockDefs)).toBe("mcp.json");
      expect(denormalizeMcpPath("opencode", mockDefs)).toBe("opencode.json");
    });
  });

  describe("canonicalizeRelativePath for MCP", () => {
    it("should canonicalize any MCP config to mcp.json", () => {
      expect(canonicalizeRelativePath("codex", "mcp", "config.toml")).toBe(
        "mcp.json",
      );
      expect(canonicalizeRelativePath("cursor", "mcp", "mcp.json")).toBe(
        "mcp.json",
      );
      expect(canonicalizeRelativePath("opencode", "mcp", "opencode.json")).toBe(
        "mcp.json",
      );
    });
  });

  describe("OpenCode agent file mapping", () => {
    // OpenCode uses AGENTS.md (same as Cursor/Codex)
    // See: https://opencode.ai/docs/rules/
    it("should preserve AGENTS.md for opencode", () => {
      expect(canonicalizeRelativePath("opencode", "agents", "AGENTS.md")).toBe(
        "AGENTS.md",
      );
    });

    it("should denormalize AGENTS.md to AGENTS.md for opencode", () => {
      expect(denormalizeRelativePath("opencode", "agents", "AGENTS.md")).toBe(
        "AGENTS.md",
      );
    });
  });

  describe("OpenCode singular directory mapping", () => {
    describe("canonicalizeRelativePath", () => {
      it("should convert opencode skill/ to canonical skills/", () => {
        expect(
          canonicalizeRelativePath(
            "opencode",
            "skills",
            "skill/myskill/SKILL.md",
          ),
        ).toBe("skills/myskill/SKILL.md");
      });
    });

    describe("remapRelativePathForTarget", () => {
      it("should convert skills/ to skill/ for opencode", () => {
        const asset: AssetContent = {
          client: "cursor",
          type: "skills",
          path: "/cursor/skills/myskill/SKILL.md",
          relativePath: "skills/myskill/SKILL.md",
          canonicalPath: "skills/myskill/SKILL.md",
          name: "myskill",
          content: "content",
          hash: "hash",
        };
        expect(
          remapRelativePathForTarget(
            asset,
            "opencode",
            "skills/myskill/SKILL.md",
          ),
        ).toBe("skill/myskill/SKILL.md");
      });
    });
  });

  describe("flattenSkillPath", () => {
    it("should not flatten single-level skill paths", () => {
      expect(flattenSkillPath("skills/review/SKILL.md")).toBe(
        "skills/review/SKILL.md",
      );
    });

    it("should flatten two-level nested skill paths", () => {
      expect(flattenSkillPath("skills/commands/review/SKILL.md")).toBe(
        "skills/commands-review/SKILL.md",
      );
    });

    it("should flatten deeply nested skill paths", () => {
      expect(
        flattenSkillPath("skills/builder/steps/initialize-component/SKILL.md"),
      ).toBe("skills/builder-steps-initialize-component/SKILL.md");
    });

    it("should handle skill/ prefix (opencode)", () => {
      expect(flattenSkillPath("skill/builder/steps/init/SKILL.md")).toBe(
        "skill/builder-steps-init/SKILL.md",
      );
    });

    it("should not modify non-skill paths", () => {
      expect(flattenSkillPath("rules/test.md")).toBe("rules/test.md");
    });

    it("should flatten nested skills during remapRelativePathForTarget", () => {
      const asset: AssetContent = {
        client: "canonical",
        type: "skills",
        path: "/agents/skills/builder/steps/init/SKILL.md",
        relativePath: "skills/builder/steps/init/SKILL.md",
        canonicalPath: "skills/builder/steps/init/SKILL.md",
        name: "init",
        content: "content",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(
          asset,
          "codex",
          "skills/builder/steps/init/SKILL.md",
        ),
      ).toBe("skills/builder-steps-init/SKILL.md");
    });

    it("should flatten AND remap to skill/ for opencode", () => {
      const asset: AssetContent = {
        client: "canonical",
        type: "skills",
        path: "/agents/skills/builder/steps/init/SKILL.md",
        relativePath: "skills/builder/steps/init/SKILL.md",
        canonicalPath: "skills/builder/steps/init/SKILL.md",
        name: "init",
        content: "content",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(
          asset,
          "opencode",
          "skills/builder/steps/init/SKILL.md",
        ),
      ).toBe("skill/builder-steps-init/SKILL.md");
    });
  });
});
