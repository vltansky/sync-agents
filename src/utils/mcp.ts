import type { AssetContent } from "../types/index.js";

/**
 * Secret key name patterns (case-insensitive)
 */
const SECRET_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /private/i,
  /access/i,
  /api_/i,
];

/**
 * Secret value patterns
 */
const SECRET_VALUE_PATTERNS = [
  /^sk-/, // OpenAI
  /^pk-/, // OpenAI public
  /^ghp_/, // GitHub PAT
  /^gho_/, // GitHub OAuth
  /^ghs_/, // GitHub App
  /^ghu_/, // GitHub user-to-server
  /^github_pat_/, // GitHub fine-grained PAT
  /^xox[baprs]-/, // Slack tokens
  /^Bearer\s/i, // Bearer tokens
  /^Basic\s/i, // Basic auth
  /^AKIA/, // AWS access key
  /^eyJ/, // JWT tokens (base64 JSON)
];

/**
 * Check if a key name suggests it contains a secret
 */
function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Check if a value looks like a secret
 */
function isSecretValue(value: string): boolean {
  // Check known patterns
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }

  // Long alphanumeric strings (32+ chars) are likely secrets
  if (value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value)) {
    return true;
  }

  return false;
}

/**
 * Obfuscate a value, showing only prefix and suffix
 */
function obfuscateValue(value: string): string {
  if (value.length <= 8) {
    return "[hidden]";
  }

  const prefixLen = Math.min(4, Math.floor(value.length / 4));
  const suffixLen = Math.min(3, Math.floor(value.length / 4));

  return `${value.slice(0, prefixLen)}...${value.slice(-suffixLen)}`;
}

/**
 * Obfuscate an env value if it appears to be a secret
 * Returns the original value if not a secret, obfuscated version otherwise
 */
export function obfuscateEnvValue(key: string, value: string): string {
  if (isSecretKey(key) || isSecretValue(value)) {
    return obfuscateValue(value);
  }
  return value;
}

/**
 * Format env vars for display, obfuscating secrets
 */
export function formatEnvForDisplay(
  env: Record<string, string> | undefined,
): string {
  if (!env || Object.keys(env).length === 0) {
    return "no env";
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    const displayValue = obfuscateEnvValue(key, value);
    parts.push(`${key}=${displayValue}`);
  }

  return parts.join(", ");
}

/**
 * Compare two server configs and return differences
 */
export function compareServerConfigs(
  a: McpServerConfig,
  b: McpServerConfig,
): { same: boolean; differences: string[] } {
  const differences: string[] = [];

  // Compare command
  if (a.command !== b.command) {
    differences.push(`command: "${a.command}" vs "${b.command}"`);
  }

  // Compare args
  const argsA = JSON.stringify(a.args ?? []);
  const argsB = JSON.stringify(b.args ?? []);
  if (argsA !== argsB) {
    differences.push(`args differ`);
  }

  // Compare env
  const envA = a.env ?? {};
  const envB = b.env ?? {};
  const allEnvKeys = new Set([...Object.keys(envA), ...Object.keys(envB)]);

  for (const key of allEnvKeys) {
    const valA = envA[key];
    const valB = envB[key];

    if (valA !== valB) {
      if (valA === undefined) {
        differences.push(
          `${key}: [missing] vs ${obfuscateEnvValue(key, valB!)}`,
        );
      } else if (valB === undefined) {
        differences.push(
          `${key}: ${obfuscateEnvValue(key, valA)} vs [missing]`,
        );
      } else {
        differences.push(
          `${key}: ${obfuscateEnvValue(key, valA)} vs ${obfuscateEnvValue(key, valB)}`,
        );
      }
    }
  }

  return {
    same: differences.length === 0,
    differences,
  };
}

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
  // Handle empty content
  if (!content.trim()) {
    return { mcpServers: {} };
  }

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
  } catch {
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

/**
 * Validation result for MCP config
 */
export interface McpValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate MCP config content
 */
export function validateMcpConfig(
  content: string,
  format: McpFormat,
): McpValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Try to parse
  const config = parseMcpConfig(content, format);
  if (!config) {
    errors.push(`Failed to parse ${format} config`);
    return { valid: false, errors, warnings };
  }

  // Check for mcpServers
  if (!config.mcpServers) {
    warnings.push("Config has no mcpServers key");
    return { valid: true, errors, warnings };
  }

  // Validate each server
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    if (!serverConfig.command) {
      errors.push(`Server "${serverName}" has no command`);
    }

    // Check for empty command
    if (
      serverConfig.command &&
      typeof serverConfig.command === "string" &&
      serverConfig.command.trim() === ""
    ) {
      errors.push(`Server "${serverName}" has empty command`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Get list of commands used in MCP config
 */
export function getMcpCommands(config: McpConfig): string[] {
  const commands = new Set<string>();

  if (config.mcpServers) {
    for (const serverConfig of Object.values(config.mcpServers)) {
      if (serverConfig.command) {
        // Extract base command (first word)
        const baseCommand = serverConfig.command.split(/\s+/)[0];
        commands.add(baseCommand);
      }
    }
  }

  return Array.from(commands);
}

/**
 * Find servers that exist in target but not in source (would be removed)
 */
export function findRemovedServers(
  sourceConfig: McpConfig,
  targetConfig: McpConfig,
): string[] {
  const sourceServers = new Set(Object.keys(sourceConfig.mcpServers ?? {}));
  const targetServers = Object.keys(targetConfig.mcpServers ?? {});

  return targetServers.filter((name) => !sourceServers.has(name));
}
