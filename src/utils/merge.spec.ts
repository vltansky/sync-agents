import { describe, it, expect } from "vitest";
import type { AssetContent, ClientDefinition } from "../types/index.js";
import {
  mergeRulesIntoAgents,
  shouldMergeRulesIntoAgents,
  getRulesForMerge,
} from "./merge.js";

describe("merge utilities", () => {
  describe("mergeRulesIntoAgents", () => {
    it("should return agent content unchanged when no rules", () => {
      const agentContent = "# Agent Instructions\n\nDo stuff.";
      expect(mergeRulesIntoAgents(agentContent, [])).toBe(agentContent);
    });

    it("should append rules section to agent content", () => {
      const agentContent = "# Agent Instructions\n\nDo stuff.";
      const rules: AssetContent[] = [
        {
          client: "cursor",
          type: "rules",
          path: "/cursor/rules/test.md",
          relativePath: "rules/test.md",
          canonicalPath: "rules/test.md",
          name: "test",
          content: "Always use TypeScript.",
          hash: "hash1",
        },
      ];

      const result = mergeRulesIntoAgents(agentContent, rules);
      expect(result).toContain("# Agent Instructions");
      expect(result).toContain("# Rules");
      expect(result).toContain("## Rule: test");
      expect(result).toContain("Always use TypeScript.");
    });

    it("should merge multiple rules with separators", () => {
      const agentContent = "# Agent";
      const rules: AssetContent[] = [
        {
          client: "cursor",
          type: "rules",
          path: "/cursor/rules/a.md",
          relativePath: "rules/a.md",
          canonicalPath: "rules/a.md",
          name: "a",
          content: "Rule A content",
          hash: "hash1",
        },
        {
          client: "cursor",
          type: "rules",
          path: "/cursor/rules/b.md",
          relativePath: "rules/b.md",
          canonicalPath: "rules/b.md",
          name: "b",
          content: "Rule B content",
          hash: "hash2",
        },
      ];

      const result = mergeRulesIntoAgents(agentContent, rules);
      expect(result).toContain("## Rule: a");
      expect(result).toContain("Rule A content");
      expect(result).toContain("## Rule: b");
      expect(result).toContain("Rule B content");
      // Rules should be separated
      expect(result.match(/---/g)?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("shouldMergeRulesIntoAgents", () => {
    it("should return true for client without rules support", () => {
      const claudeDef: ClientDefinition = {
        name: "claude",
        displayName: "Claude Code",
        root: "/home/.claude",
        assets: [
          { type: "agents", patterns: ["CLAUDE.md"] },
          { type: "commands", patterns: ["commands/**/*.md"] },
          { type: "rules", patterns: [] },
        ],
      };
      expect(shouldMergeRulesIntoAgents(claudeDef)).toBe(true);
    });

    it("should return false for client with rules support", () => {
      const cursorDef: ClientDefinition = {
        name: "cursor",
        displayName: "Cursor",
        root: "/home/.cursor",
        assets: [
          { type: "agents", patterns: ["AGENTS.md"] },
          { type: "rules", patterns: ["rules/**/*.md"] },
        ],
      };
      expect(shouldMergeRulesIntoAgents(cursorDef)).toBe(false);
    });
  });

  describe("getRulesForMerge", () => {
    const assets: AssetContent[] = [
      {
        client: "cursor",
        type: "rules",
        path: "/cursor/rules/a.md",
        relativePath: "rules/a.md",
        canonicalPath: "rules/a.md",
        name: "a",
        content: "Rule A",
        hash: "hash1",
      },
      {
        client: "cursor",
        type: "agents",
        path: "/cursor/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "Agent",
        hash: "hash2",
      },
      {
        client: "opencode",
        type: "rules",
        path: "/opencode/rules/b.md",
        relativePath: "rules/b.md",
        canonicalPath: "rules/b.md",
        name: "b",
        content: "Rule B",
        hash: "hash3",
      },
    ];

    it("should return only rules assets", () => {
      const rules = getRulesForMerge(assets);
      expect(rules).toHaveLength(2);
      expect(rules.every((r) => r.type === "rules")).toBe(true);
    });

    it("should filter by source client when specified", () => {
      const rules = getRulesForMerge(assets, "cursor");
      expect(rules).toHaveLength(1);
      expect(rules[0].client).toBe("cursor");
    });
  });
});
