import { describe, it, expect } from "vitest";
import type { AssetContent } from "../types/index.js";
import {
  normalizeRelativePath,
  canonicalizeRelativePath,
  denormalizeRelativePath,
  buildTargetAbsolutePath,
  resolveTargetRelativePath,
  remapRelativePathForTarget,
} from "./paths.js";

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

    it("should convert commands to prompts for codex", () => {
      expect(
        canonicalizeRelativePath("codex", "commands", "commands/test.md"),
      ).toBe("prompts/test.md");
    });

    it("should not modify paths for other clients", () => {
      expect(
        canonicalizeRelativePath("claude", "commands", "commands/test.md"),
      ).toBe("commands/test.md");
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
    it("should convert commands to prompts for codex", () => {
      const asset: AssetContent = {
        client: "claude",
        type: "commands",
        path: "/claude/commands/test.md",
        relativePath: "commands/test.md",
        canonicalPath: "commands/test.md",
        name: "test",
        content: "content",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(asset, "codex", "commands/test.md"),
      ).toBe("prompts/test.md");
    });

    it("should preserve commands path for non-codex clients", () => {
      const asset: AssetContent = {
        client: "claude",
        type: "commands",
        path: "/claude/commands/test.md",
        relativePath: "commands/test.md",
        canonicalPath: "commands/test.md",
        name: "test",
        content: "content",
        hash: "hash",
      };
      expect(
        remapRelativePathForTarget(asset, "claude", "commands/test.md"),
      ).toBe("commands/test.md");
    });
  });
});
