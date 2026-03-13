import { describe, expect, it } from "vitest";
import { hashContent } from "./fs.js";
import { getBootstrapResolution } from "./bootstrap.js";
import { buildLegacyDefinitions } from "./canonical.js";
import type { AssetContent } from "../types/index.js";

function makeAsset(
  client: AssetContent["client"],
  type: AssetContent["type"],
  relativePath: string,
  content = `${client}:${relativePath}`,
): AssetContent {
  return {
    client,
    type,
    path: `/${client}/${relativePath}`,
    relativePath,
    canonicalPath: relativePath,
    name: relativePath,
    content,
    hash: hashContent(content),
  };
}

describe("getBootstrapResolution", () => {
  it("returns missing when there are no candidates", () => {
    expect(
      getBootstrapResolution({
        canonicalPath: "AGENTS.md",
        candidates: [],
      }),
    ).toEqual({ status: "missing" });
  });

  it("auto-selects the only candidate", () => {
    const candidate = makeAsset("claude", "agents", "AGENTS.md");

    expect(
      getBootstrapResolution({
        canonicalPath: "AGENTS.md",
        candidates: [candidate],
      }),
    ).toEqual({ status: "selected", asset: candidate });
  });

  it("uses the explicit bootstrap source when present", () => {
    const claude = makeAsset("claude", "agents", "AGENTS.md");
    const cursor = makeAsset("cursor", "agents", "AGENTS.md");

    expect(
      getBootstrapResolution({
        canonicalPath: "AGENTS.md",
        candidates: [claude, cursor],
        bootstrapSource: "cursor",
      }),
    ).toEqual({ status: "selected", asset: cursor });
  });

  it("errors when the explicit bootstrap source is not available", () => {
    const claude = makeAsset("claude", "agents", "AGENTS.md");
    const cursor = makeAsset("cursor", "agents", "AGENTS.md");

    expect(() =>
      getBootstrapResolution({
        canonicalPath: "AGENTS.md",
        candidates: [claude, cursor],
        bootstrapSource: "codex",
      }),
    ).toThrow(/bootstrap-source codex is not available/i);
  });

  it("surfaces ambiguity when multiple candidates exist and no source is given", () => {
    const claude = makeAsset("claude", "agents", "AGENTS.md");
    const cursor = makeAsset("cursor", "agents", "AGENTS.md");

    expect(
      getBootstrapResolution({
        canonicalPath: "AGENTS.md",
        candidates: [claude, cursor],
      }),
    ).toEqual({
      status: "ambiguous",
      candidates: [claude, cursor],
    });
  });
  it("surfaces ambiguity when bootstrap-source still matches multiple files", () => {
    const projectCursor = makeAsset("project", "mcp", "mcp.json", "cursor");
    projectCursor.path = "/project/.cursor/mcp.json";
    const projectRoot = makeAsset("project", "mcp", "mcp.json", "root");
    projectRoot.path = "/project/.mcp.json";

    expect(
      getBootstrapResolution({
        canonicalPath: "mcp.json",
        candidates: [projectCursor, projectRoot],
        bootstrapSource: "project",
      }),
    ).toEqual({
      status: "ambiguous",
      candidates: [projectCursor, projectRoot],
    });
  });
});

describe("buildLegacyDefinitions", () => {
  it("excludes the project client from legacy bootstrap sources", () => {
    const defs = buildLegacyDefinitions("/repo");
    expect(defs.some((def) => def.name === "project")).toBe(false);
  });
});
