import { describe, it, expect } from "vitest";
import { buildSyncPlan } from "./plan.js";
import type {
  AssetContent,
  ClientDefinition,
  AgentClientName,
  AssetType,
} from "../types/index.js";

describe("buildSyncPlan", () => {
  it("should create a merge plan with priority order", () => {
    const assets: AssetContent[] = [
      {
        client: "project",
        type: "agents",
        path: "/project/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "project content",
        hash: "hash1",
      },
      {
        client: "claude",
        type: "agents",
        path: "/claude/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "claude content",
        hash: "hash2",
      },
    ];

    const defs: ClientDefinition[] = [
      {
        name: "project",
        displayName: "Project",
        root: "/project",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
      {
        name: "claude",
        displayName: "Claude",
        root: "/claude",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
    ];

    const options = {
      mode: "merge" as const,
      priority: ["project", "claude"] as AgentClientName[],
    };

    const { plan, desiredAssets } = buildSyncPlan(assets, defs, options);

    expect(desiredAssets.size).toBe(1);
    const asset = desiredAssets.get("agents::AGENTS.md");
    expect(asset?.content).toBe("project content");
    expect(asset?.hash).toBe("hash1");
  });

  it("should skip entries that are already up-to-date", () => {
    const sourceAsset: AssetContent = {
      client: "claude",
      type: "agents",
      path: "/claude/AGENTS.md",
      relativePath: "AGENTS.md",
      canonicalPath: "AGENTS.md",
      name: "AGENTS",
      content: "same content",
      hash: "sameHash",
    };

    const targetAsset: AssetContent = {
      client: "project",
      type: "agents",
      path: "/project/AGENTS.md",
      relativePath: "AGENTS.md",
      canonicalPath: "AGENTS.md",
      name: "AGENTS",
      content: "same content",
      hash: "sameHash",
    };

    const defs: ClientDefinition[] = [
      {
        name: "claude",
        displayName: "Claude",
        root: "/claude",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
      {
        name: "project",
        displayName: "Project",
        root: "/project",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
    ];

    const options = {
      mode: "merge" as const,
      clients: ["project"] as AgentClientName[],
      priority: ["claude", "project"] as AgentClientName[],
    };

    const { plan } = buildSyncPlan([sourceAsset, targetAsset], defs, options);

    expect(plan).toHaveLength(1);
    expect(plan[0].action).toBe("skip");
    expect(plan[0].reason).toBe("up-to-date");
  });

  it("should create update entries for changed content", () => {
    const sourceAsset: AssetContent = {
      client: "claude",
      type: "agents",
      path: "/claude/AGENTS.md",
      relativePath: "AGENTS.md",
      canonicalPath: "AGENTS.md",
      name: "AGENTS",
      content: "new content",
      hash: "newHash",
    };

    const existingAsset: AssetContent = {
      client: "project",
      type: "agents",
      path: "/project/AGENTS.md",
      relativePath: "AGENTS.md",
      canonicalPath: "AGENTS.md",
      name: "AGENTS",
      content: "old content",
      hash: "oldHash",
    };

    const defs: ClientDefinition[] = [
      {
        name: "project",
        displayName: "Project",
        root: "/project",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
      {
        name: "claude",
        displayName: "Claude",
        root: "/claude",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
    ];

    const options = {
      mode: "merge" as const,
      priority: ["claude", "project"] as AgentClientName[],
    };

    const { plan } = buildSyncPlan([sourceAsset, existingAsset], defs, options);

    const updateForProject = plan.find((e) => e.targetClient === "project");
    expect(updateForProject?.action).toBe("update");
    expect(updateForProject?.asset.hash).toBe("newHash");
  });

  it("should filter by asset types when specified", () => {
    const assets: AssetContent[] = [
      {
        client: "project",
        type: "agents",
        path: "/project/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "agents content",
        hash: "hash1",
      },
      {
        client: "project",
        type: "commands",
        path: "/project/commands/test.md",
        relativePath: "commands/test.md",
        canonicalPath: "commands/test.md",
        name: "test",
        content: "command content",
        hash: "hash2",
      },
    ];

    const defs: ClientDefinition[] = [
      {
        name: "claude",
        displayName: "Claude",
        root: "/claude",
        assets: [
          { type: "agents", patterns: ["AGENTS.md"] },
          { type: "commands", patterns: ["commands/**/*.md"] },
        ],
      },
    ];

    const options = {
      mode: "merge" as const,
      types: ["agents"] as AssetType[],
    };

    const { desiredAssets } = buildSyncPlan(assets, defs, options);

    expect(desiredAssets.size).toBe(1);
    expect(desiredAssets.has("agents::AGENTS.md")).toBe(true);
    expect(desiredAssets.has("commands::commands/test.md")).toBe(false);
  });

  it("should use source mode when specified", () => {
    const assets: AssetContent[] = [
      {
        client: "claude",
        type: "agents",
        path: "/claude/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "claude content",
        hash: "hash1",
      },
      {
        client: "project",
        type: "agents",
        path: "/project/AGENTS.md",
        relativePath: "AGENTS.md",
        canonicalPath: "AGENTS.md",
        name: "AGENTS",
        content: "project content",
        hash: "hash2",
      },
    ];

    const defs: ClientDefinition[] = [
      {
        name: "claude",
        displayName: "Claude",
        root: "/claude",
        assets: [{ type: "agents", patterns: ["AGENTS.md"] }],
      },
    ];

    const options = {
      mode: "source" as const,
      source: "claude" as AgentClientName,
    };

    const { desiredAssets } = buildSyncPlan(assets, defs, options);

    expect(desiredAssets.size).toBe(1);
    const asset = desiredAssets.get("agents::AGENTS.md");
    expect(asset?.client).toBe("claude");
    expect(asset?.content).toBe("claude content");
  });
});
