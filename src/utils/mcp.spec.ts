import { describe, it, expect } from "vitest";
import {
  detectMcpFormat,
  parseMcpConfig,
  serializeMcpConfig,
  mergeMcpConfigs,
  mergeMcpAssets,
  type McpConfig,
} from "./mcp.js";
import type { AssetContent } from "../types/index.js";

describe("detectMcpFormat", () => {
  it("detects JSON format", () => {
    expect(detectMcpFormat("config.json")).toBe("json");
    expect(detectMcpFormat("mcp.json")).toBe("json");
  });

  it("detects JSONC format", () => {
    expect(detectMcpFormat("config.jsonc")).toBe("jsonc");
  });

  it("detects TOML format", () => {
    expect(detectMcpFormat("config.toml")).toBe("toml");
  });

  it("detects YAML format", () => {
    expect(detectMcpFormat("config.yaml")).toBe("yaml");
    expect(detectMcpFormat("config.yml")).toBe("yaml");
  });

  it("returns unknown for unrecognized formats", () => {
    expect(detectMcpFormat("config.txt")).toBe("unknown");
  });
});

describe("parseMcpConfig", () => {
  it("parses JSON config", () => {
    const json = `{
      "mcpServers": {
        "filesystem": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem"]
        }
      }
    }`;

    const result = parseMcpConfig(json, "json");
    expect(result).toEqual({
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
        },
      },
    });
  });

  it("parses JSONC config with comments", () => {
    const jsonc = `{
      // This is a comment
      "mcpServers": {
        /* Multi-line
           comment */
        "filesystem": {
          "command": "npx"
        }
      }
    }`;

    const result = parseMcpConfig(jsonc, "jsonc");
    expect(result?.mcpServers?.filesystem).toBeDefined();
    expect(result?.mcpServers?.filesystem?.command).toBe("npx");
  });

  it("parses TOML config", () => {
    const toml = `[mcpServers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]`;

    const result = parseMcpConfig(toml, "toml");
    expect(result?.mcpServers?.filesystem).toBeDefined();
    expect(result?.mcpServers?.filesystem?.command).toBe("npx");
  });

  it("parses YAML config", () => {
    const yaml = `mcpServers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem"]`;

    const result = parseMcpConfig(yaml, "yaml");
    expect(result?.mcpServers?.filesystem).toBeDefined();
    expect(result?.mcpServers?.filesystem?.command).toBe("npx");
  });

  it("returns null for invalid config", () => {
    const result = parseMcpConfig("invalid json {", "json");
    expect(result).toBeNull();
  });
});

describe("serializeMcpConfig", () => {
  const config: McpConfig = {
    mcpServers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
      },
    },
  };

  it("serializes to JSON", () => {
    const result = serializeMcpConfig(config, "json");
    const parsed = JSON.parse(result);
    expect(parsed.mcpServers.filesystem.command).toBe("npx");
  });

  it("serializes to TOML", () => {
    const result = serializeMcpConfig(config, "toml");
    expect(result).toContain("[mcpServers.filesystem]");
    expect(result).toContain('command = "npx"');
  });

  it("serializes to YAML", () => {
    const result = serializeMcpConfig(config, "yaml");
    expect(result).toContain("mcpServers:");
    expect(result).toContain("  filesystem:");
    expect(result).toContain('    command: "npx"');
  });
});

describe("mergeMcpConfigs", () => {
  it("merges configs with non-overlapping servers", () => {
    const config1: McpConfig = {
      mcpServers: {
        filesystem: { command: "npx" },
      },
    };
    const config2: McpConfig = {
      mcpServers: {
        github: { command: "gh" },
      },
    };

    const result = mergeMcpConfigs([config1, config2]);
    expect(result.mcpServers?.filesystem).toBeDefined();
    expect(result.mcpServers?.github).toBeDefined();
  });

  it("later configs override earlier ones for same server", () => {
    const config1: McpConfig = {
      mcpServers: {
        filesystem: { command: "npx", args: ["old"] },
      },
    };
    const config2: McpConfig = {
      mcpServers: {
        filesystem: { command: "node", args: ["new"] },
      },
    };

    const result = mergeMcpConfigs([config1, config2]);
    expect(result.mcpServers?.filesystem?.command).toBe("node");
    expect(result.mcpServers?.filesystem?.args).toEqual(["new"]);
  });

  it("merges other top-level keys", () => {
    const config1: McpConfig = {
      mcpServers: {},
      customKey: "value1",
    };
    const config2: McpConfig = {
      mcpServers: {},
      anotherKey: "value2",
    };

    const result = mergeMcpConfigs([config1, config2]);
    expect(result.customKey).toBe("value1");
    expect(result.anotherKey).toBe("value2");
  });

  it("handles empty configs array", () => {
    const result = mergeMcpConfigs([]);
    expect(result).toEqual({ mcpServers: {} });
  });
});

describe("mergeMcpAssets", () => {
  it("merges JSON MCP assets", () => {
    const asset1: AssetContent = {
      client: "cursor",
      type: "mcp",
      path: "/path/mcp.json",
      relativePath: "mcp.json",
      canonicalPath: "mcp.json",
      name: "mcp",
      content: JSON.stringify({
        mcpServers: {
          filesystem: { command: "npx" },
        },
      }),
      hash: "hash1",
    };

    const asset2: AssetContent = {
      client: "cline",
      type: "mcp",
      path: "/path/mcp.json",
      relativePath: "mcp.json",
      canonicalPath: "mcp.json",
      name: "mcp",
      content: JSON.stringify({
        mcpServers: {
          github: { command: "gh" },
        },
      }),
      hash: "hash2",
    };

    const result = mergeMcpAssets([asset1, asset2]);
    expect(result).toBeTruthy();

    const parsed = JSON.parse(result!);
    expect(parsed.mcpServers.filesystem).toBeDefined();
    expect(parsed.mcpServers.github).toBeDefined();
  });

  it("returns single asset content unchanged", () => {
    const asset: AssetContent = {
      client: "cursor",
      type: "mcp",
      path: "/path/mcp.json",
      relativePath: "mcp.json",
      canonicalPath: "mcp.json",
      name: "mcp",
      content: '{"mcpServers":{}}',
      hash: "hash1",
    };

    const result = mergeMcpAssets([asset]);
    expect(result).toBe(asset.content);
  });

  it("returns null for empty assets array", () => {
    const result = mergeMcpAssets([]);
    expect(result).toBeNull();
  });

  it("falls back to concatenation if parsing fails", () => {
    const asset1: AssetContent = {
      client: "cursor",
      type: "mcp",
      path: "/path/mcp.json",
      relativePath: "mcp.json",
      canonicalPath: "mcp.json",
      name: "mcp",
      content: "invalid json {",
      hash: "hash1",
    };

    const asset2: AssetContent = {
      client: "cline",
      type: "mcp",
      path: "/path/mcp.json",
      relativePath: "mcp.json",
      canonicalPath: "mcp.json",
      name: "mcp",
      content: "also invalid }",
      hash: "hash2",
    };

    const result = mergeMcpAssets([asset1, asset2]);
    expect(result).toContain("---");
    expect(result).toContain("invalid json {");
    expect(result).toContain("also invalid }");
  });

  it("merges TOML configs", () => {
    const asset1: AssetContent = {
      client: "codex",
      type: "mcp",
      path: "/path/config.toml",
      relativePath: "config.toml",
      canonicalPath: "config.toml",
      name: "config",
      content: `[mcpServers.filesystem]
command = "npx"`,
      hash: "hash1",
    };

    const asset2: AssetContent = {
      client: "codex",
      type: "mcp",
      path: "/path/config.toml",
      relativePath: "config.toml",
      canonicalPath: "config.toml",
      name: "config",
      content: `[mcpServers.github]
command = "gh"`,
      hash: "hash2",
    };

    const result = mergeMcpAssets([asset1, asset2]);
    expect(result).toBeTruthy();
    expect(result).toContain("[mcpServers.filesystem]");
    expect(result).toContain("[mcpServers.github]");
  });
});
