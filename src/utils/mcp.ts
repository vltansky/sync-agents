import type { AssetContent } from "../types/index.js";

/**
 * Normalized MCP config structure
 */
export interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

export type McpFormat = "json" | "jsonc" | "toml" | "yaml" | "unknown";

/**
 * Detect config format from file extension
 */
export function detectMcpFormat(filePath: string): McpFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".jsonc")) return "jsonc";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  return "unknown";
}

/**
 * Parse MCP config from various formats
 */
export function parseMcpConfig(
  content: string,
  format: McpFormat,
): McpConfig | null {
  try {
    switch (format) {
      case "json":
      case "jsonc":
        return parseJsonWithComments(content);
      case "toml":
        return parseToml(content);
      case "yaml":
        return parseYaml(content);
      default:
        return null;
    }
  } catch (error) {
    console.warn(`Failed to parse MCP config: ${error}`);
    return null;
  }
}

/**
 * Serialize MCP config to target format
 */
export function serializeMcpConfig(
  config: McpConfig,
  format: McpFormat,
  indent = 2,
): string {
  switch (format) {
    case "json":
    case "jsonc":
      return JSON.stringify(config, null, indent);
    case "toml":
      return serializeToml(config, indent);
    case "yaml":
      return serializeYaml(config, indent);
    default:
      return JSON.stringify(config, null, indent);
  }
}

/**
 * Merge multiple MCP configs at entry level
 * Later entries override earlier ones for the same server key
 */
export function mergeMcpConfigs(configs: McpConfig[]): McpConfig {
  const merged: McpConfig = { mcpServers: {} };

  for (const config of configs) {
    // Merge mcpServers
    if (config.mcpServers) {
      merged.mcpServers = {
        ...merged.mcpServers,
        ...config.mcpServers,
      };
    }

    // Merge other top-level keys
    for (const [key, value] of Object.entries(config)) {
      if (key !== "mcpServers") {
        merged[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Merge MCP assets and serialize to target format
 */
export function mergeMcpAssets(assets: AssetContent[]): string | null {
  if (assets.length === 0) return null;
  if (assets.length === 1) return assets[0].content;

  const configs: McpConfig[] = [];
  let targetFormat: McpFormat = "json";

  // Parse all configs
  for (const asset of assets) {
    const format = detectMcpFormat(asset.path);
    const parsed = parseMcpConfig(asset.content, format);
    if (parsed) {
      configs.push(parsed);
      // Use format of first asset as target
      if (configs.length === 1) {
        targetFormat = format;
      }
    }
  }

  if (configs.length === 0) {
    // Fallback: concatenate if parsing fails
    return assets.map((a) => a.content).join("\n\n---\n\n");
  }

  // Merge and serialize
  const merged = mergeMcpConfigs(configs);
  return serializeMcpConfig(merged, targetFormat);
}

/**
 * Parse JSON with comments (simple implementation)
 */
function parseJsonWithComments(content: string): McpConfig {
  // Remove single-line comments
  let cleaned = content.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(cleaned);
}

/**
 * Parse TOML (basic implementation)
 * For production, consider using a library like @iarna/toml
 */
function parseToml(content: string): McpConfig {
  const config: McpConfig = { mcpServers: {} };
  const lines = content.split("\n");
  let currentSection: string | null = null;
  let currentServer: McpServerConfig | null = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    // Section header [mcpServers.servername]
    const sectionMatch = line.match(/^\[mcpServers\.(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentServer = {};
      config.mcpServers![currentSection] = currentServer;
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch && currentServer) {
      const [, key, value] = kvMatch;
      currentServer[key] = parseTomlValue(value);
    }
  }

  return config;
}

/**
 * Parse TOML value
 */
function parseTomlValue(value: string): unknown {
  value = value.trim();

  // String
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  // Array
  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value
      .slice(1, -1)
      .split(",")
      .map((v) => parseTomlValue(v));
    return items;
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  return value;
}

/**
 * Serialize to TOML
 */
function serializeToml(config: McpConfig, indent: number): string {
  let output = "";

  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers,
    )) {
      output += `[mcpServers.${serverName}]\n`;
      for (const [key, value] of Object.entries(serverConfig)) {
        output += `${key} = ${serializeTomlValue(value)}\n`;
      }
      output += "\n";
    }
  }

  return output.trim();
}

/**
 * Serialize TOML value
 */
function serializeTomlValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeTomlValue).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Parse YAML (basic implementation)
 * For production, consider using a library like js-yaml
 */
function parseYaml(content: string): McpConfig {
  const config: McpConfig = { mcpServers: {} };
  const lines = content.split("\n");
  let currentKey: string | null = null;
  let currentServer: McpServerConfig | null = null;
  let indent = 0;

  for (let line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const leadingSpaces = line.length - line.trimStart().length;
    line = line.trim();

    // mcpServers section
    if (line === "mcpServers:") {
      indent = leadingSpaces;
      continue;
    }

    // Server name
    if (leadingSpaces === indent + 2 && line.endsWith(":")) {
      currentKey = line.slice(0, -1);
      currentServer = {};
      config.mcpServers![currentKey] = currentServer;
      continue;
    }

    // Server properties
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch && currentServer) {
      const [, key, value] = kvMatch;
      currentServer[key] = parseYamlValue(value);
    }
  }

  return config;
}

/**
 * Parse YAML value
 */
function parseYamlValue(value: string): unknown {
  value = value.trim();

  if (!value) return "";

  // Array
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, ""));
  }

  // String with quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }

  return value;
}

/**
 * Serialize to YAML
 */
function serializeYaml(config: McpConfig, indent: number): string {
  let output = "mcpServers:\n";

  if (config.mcpServers) {
    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers,
    )) {
      output += `  ${serverName}:\n`;
      for (const [key, value] of Object.entries(serverConfig)) {
        output += `    ${key}: ${serializeYamlValue(value)}\n`;
      }
    }
  }

  return output;
}

/**
 * Serialize YAML value
 */
function serializeYamlValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => `"${v}"`).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}
