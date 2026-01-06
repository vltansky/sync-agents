import { describe, it, expect } from "vitest";
import {
  detectMcpFormat,
  parseMcpConfig,
  serializeMcpConfig,
  mergeMcpConfigs,
  mergeMcpAssets,
  obfuscateEnvValue,
  formatEnvForDisplay,
  compareServerConfigs,
  validateMcpConfig,
  getMcpCommands,
  findRemovedServers,
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

  it("returns empty config for empty content", () => {
    const result = parseMcpConfig("", "json");
    expect(result).toEqual({ mcpServers: {} });
  });

  it("returns empty config for whitespace-only content", () => {
    const result = parseMcpConfig("   \n\t  ", "json");
    expect(result).toEqual({ mcpServers: {} });
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

describe("obfuscateEnvValue", () => {
  it("obfuscates values for secret key names", () => {
    expect(obfuscateEnvValue("API_KEY", "my-secret-value-12345")).toContain(
      "...",
    );
    expect(obfuscateEnvValue("SECRET_TOKEN", "abcdefghij")).toContain("...");
    expect(obfuscateEnvValue("PASSWORD", "mysecretpassword")).toContain("...");
    expect(obfuscateEnvValue("AUTH_TOKEN", "token12345678")).toContain("...");
  });

  it("obfuscates OpenAI-style tokens", () => {
    expect(obfuscateEnvValue("OPENAI", "sk-abc123def456ghi789")).toContain(
      "...",
    );
    expect(obfuscateEnvValue("SOME_VAR", "sk-proj-abcdefgh")).toContain("...");
  });

  it("obfuscates GitHub tokens", () => {
    expect(
      obfuscateEnvValue("GITHUB", "ghp_1234567890abcdefghijklmnop"),
    ).toContain("...");
    expect(obfuscateEnvValue("TOKEN", "github_pat_abcdefghijklmnop")).toContain(
      "...",
    );
  });

  it("obfuscates long alphanumeric strings", () => {
    const longValue = "abcdefghijklmnopqrstuvwxyz123456789012";
    expect(obfuscateEnvValue("RANDOM", longValue)).toContain("...");
  });

  it("does not obfuscate non-secret values", () => {
    expect(obfuscateEnvValue("DEBUG", "true")).toBe("true");
    expect(obfuscateEnvValue("LOG_LEVEL", "info")).toBe("info");
    expect(obfuscateEnvValue("PORT", "3000")).toBe("3000");
    expect(obfuscateEnvValue("NODE_ENV", "production")).toBe("production");
  });

  it("returns [hidden] for short secrets", () => {
    expect(obfuscateEnvValue("API_KEY", "short")).toBe("[hidden]");
    expect(obfuscateEnvValue("SECRET", "abc")).toBe("[hidden]");
  });

  it("shows prefix and suffix for longer secrets", () => {
    const result = obfuscateEnvValue("API_KEY", "sk-abcdefghijklmnop");
    expect(result).toMatch(/^sk-a\.\.\.nop$/);
  });
});

describe("formatEnvForDisplay", () => {
  it("formats env vars with obfuscated secrets", () => {
    const env = {
      API_KEY: "sk-secret12345678",
      DEBUG: "true",
    };
    const result = formatEnvForDisplay(env);
    expect(result).toContain("API_KEY=");
    expect(result).toContain("...");
    expect(result).toContain("DEBUG=true");
  });

  it("returns 'no env' for empty or undefined env", () => {
    expect(formatEnvForDisplay(undefined)).toBe("no env");
    expect(formatEnvForDisplay({})).toBe("no env");
  });
});

describe("compareServerConfigs", () => {
  it("detects identical configs", () => {
    const a = {
      command: "npx",
      args: ["-y", "server"],
      env: { DEBUG: "true" },
    };
    const b = {
      command: "npx",
      args: ["-y", "server"],
      env: { DEBUG: "true" },
    };
    const result = compareServerConfigs(a, b);
    expect(result.same).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("detects command differences", () => {
    const a = { command: "npx" };
    const b = { command: "node" };
    const result = compareServerConfigs(a, b);
    expect(result.same).toBe(false);
    expect(result.differences).toContainEqual(
      expect.stringContaining("command"),
    );
  });

  it("detects args differences", () => {
    const a = { command: "npx", args: ["old"] };
    const b = { command: "npx", args: ["new"] };
    const result = compareServerConfigs(a, b);
    expect(result.same).toBe(false);
    expect(result.differences).toContainEqual(
      expect.stringContaining("args differ"),
    );
  });

  it("detects env value differences with obfuscation", () => {
    const a = { command: "npx", env: { API_KEY: "sk-secret1111111111" } };
    const b = { command: "npx", env: { API_KEY: "sk-secret2222222222" } };
    const result = compareServerConfigs(a, b);
    expect(result.same).toBe(false);
    expect(result.differences.some((d) => d.includes("API_KEY"))).toBe(true);
    // Should be obfuscated - not contain full secrets
    expect(
      result.differences.some((d) => d.includes("sk-secret1111111111")),
    ).toBe(false);
  });

  it("detects missing env keys", () => {
    const a = { command: "npx", env: { DEBUG: "true" } };
    const b = { command: "npx", env: {} };
    const result = compareServerConfigs(a, b);
    expect(result.same).toBe(false);
    expect(result.differences.some((d) => d.includes("[missing]"))).toBe(true);
  });
});

describe("validateMcpConfig", () => {
  it("validates a correct config", () => {
    const json = JSON.stringify({
      mcpServers: {
        filesystem: { command: "npx", args: ["-y", "server"] },
      },
    });
    const result = validateMcpConfig(json, "json");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error for invalid JSON", () => {
    const result = validateMcpConfig("invalid {", "json");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("parse"));
  });

  it("returns error for server without command", () => {
    const json = JSON.stringify({
      mcpServers: {
        broken: { args: ["test"] },
      },
    });
    const result = validateMcpConfig(json, "json");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("no command"));
  });

  it("returns warning for config without mcpServers", () => {
    const json = JSON.stringify({ otherKey: "value" });
    const result = validateMcpConfig(json, "json");
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("no mcpServers"),
    );
  });
});

describe("getMcpCommands", () => {
  it("extracts unique commands from config", () => {
    const config: McpConfig = {
      mcpServers: {
        server1: { command: "npx -y @server/one" },
        server2: { command: "node" },
        server3: { command: "npx -y @server/two" },
      },
    };
    const commands = getMcpCommands(config);
    expect(commands).toContain("npx");
    expect(commands).toContain("node");
    expect(commands).toHaveLength(2);
  });

  it("returns empty array for config without servers", () => {
    const config: McpConfig = {};
    const commands = getMcpCommands(config);
    expect(commands).toHaveLength(0);
  });
});

describe("findRemovedServers", () => {
  it("finds servers that exist in target but not in source", () => {
    const source: McpConfig = {
      mcpServers: {
        kept: { command: "npx" },
      },
    };
    const target: McpConfig = {
      mcpServers: {
        kept: { command: "npx" },
        removed: { command: "node" },
      },
    };
    const removed = findRemovedServers(source, target);
    expect(removed).toContain("removed");
    expect(removed).not.toContain("kept");
  });

  it("returns empty array when no servers removed", () => {
    const source: McpConfig = {
      mcpServers: {
        server1: { command: "npx" },
        server2: { command: "node" },
      },
    };
    const target: McpConfig = {
      mcpServers: {
        server1: { command: "npx" },
      },
    };
    const removed = findRemovedServers(source, target);
    expect(removed).toHaveLength(0);
  });

  it("handles empty configs", () => {
    expect(findRemovedServers({}, {})).toHaveLength(0);
    expect(findRemovedServers({ mcpServers: {} }, {})).toHaveLength(0);
  });
});
