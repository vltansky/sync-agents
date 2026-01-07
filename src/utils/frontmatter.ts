import type { AgentClientName, AssetType } from "../types/index.js";

interface FrontmatterData {
  [key: string]: unknown;
}

interface ParsedMarkdown {
  frontmatter: FrontmatterData | null;
  body: string;
  raw: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * Parse YAML frontmatter from markdown content.
 * Simple parser that handles common cases without external deps.
 */
export function parseFrontmatter(content: string): ParsedMarkdown {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatter: null, body: content, raw: content };
  }

  const yamlContent = match[1];
  const body = content.slice(match[0].length);

  const frontmatter = parseSimpleYaml(yamlContent);

  return { frontmatter, body, raw: content };
}

/**
 * Simple YAML parser for frontmatter.
 * Handles: scalar values, arrays, simple nested objects.
 * Does NOT handle: multiline strings, anchors/aliases, flow syntax, deeply nested structures.
 * Intentionally minimal to avoid external deps for simple frontmatter use cases.
 */
function parseSimpleYaml(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split("\n");

  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;
  let currentObject: Record<string, unknown> | null = null;
  let indent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const lineIndent = line.search(/\S/);

    // Array item
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      if (currentArray && lineIndent > indent) {
        currentArray.push(parseYamlValue(value));
      }
      continue;
    }

    // Key-value pair with nested object
    if (
      trimmed.includes(": ") &&
      lineIndent > indent &&
      currentKey &&
      currentObject
    ) {
      const colonIdx = trimmed.indexOf(":");
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      currentObject[key] = parseYamlValue(value);
      continue;
    }

    // Top-level key
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      // Finish previous key
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
      } else if (currentKey && currentObject) {
        result[currentKey] = currentObject;
      }

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      currentKey = key;
      indent = lineIndent;

      if (value === "") {
        // Could be array or object, check next line
        currentArray = [];
        currentObject = {};
      } else {
        result[key] = parseYamlValue(value);
        currentKey = null;
        currentArray = null;
        currentObject = null;
      }
    }
  }

  // Finish last key
  if (currentKey && currentArray && currentArray.length > 0) {
    result[currentKey] = currentArray;
  } else if (
    currentKey &&
    currentObject &&
    Object.keys(currentObject).length > 0
  ) {
    result[currentKey] = currentObject;
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;

  // Quoted string
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  return value;
}

/**
 * Reconstruct markdown with new frontmatter.
 */
export function reconstructMarkdown(
  frontmatter: FrontmatterData,
  body: string,
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${item}`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${v}`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const COLOR_MAP: Record<string, string> = {
  purple: "#9B59B6",
  blue: "#3498DB",
  green: "#27AE60",
  red: "#E74C3C",
  orange: "#E67E22",
  yellow: "#F1C40F",
  pink: "#E91E63",
  cyan: "#00BCD4",
  teal: "#009688",
  indigo: "#3F51B5",
  gray: "#95A5A6",
  grey: "#95A5A6",
  black: "#000000",
  white: "#FFFFFF",
};

/**
 * Transform agent frontmatter for OpenCode compatibility.
 * Uses regex-based surgical replacement to preserve original formatting.
 * OpenCode requires:
 * - tools: Record<string, boolean> (not comma-separated string or array)
 * - color: hex format (#RRGGBB)
 */
export function transformForOpenCode(content: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return content;

  let frontmatterYaml = match[1];
  let modified = false;

  // Transform tools from comma-separated string to object format
  // Match: tools: Read, Edit, Bash (single line, comma-separated)
  const toolsStringMatch = frontmatterYaml.match(
    /^(tools:\s*)([A-Za-z][A-Za-z0-9_,\s]+)$/m,
  );
  if (toolsStringMatch) {
    const toolsList = toolsStringMatch[2]
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // Only transform if it looks like a comma-separated list (not already object format)
    if (toolsList.length > 0 && !toolsStringMatch[2].includes(":")) {
      const toolsYaml =
        "tools:\n" + toolsList.map((t) => `  ${t}: true`).join("\n");
      frontmatterYaml = frontmatterYaml.replace(toolsStringMatch[0], toolsYaml);
      modified = true;
    }
  }

  // Transform color from named color to hex
  const colorMatch = frontmatterYaml.match(/^(color:\s*)([a-zA-Z]+)\s*$/m);
  if (colorMatch) {
    const colorName = colorMatch[2].toLowerCase();
    const hex = COLOR_MAP[colorName];
    if (hex) {
      frontmatterYaml = frontmatterYaml.replace(
        colorMatch[0],
        `color: "${hex}"`,
      );
      modified = true;
    }
  }

  if (!modified) return content;

  // Reconstruct with modified frontmatter
  const body = content.slice(match[0].length);
  return `---\n${frontmatterYaml}\n---\n${body}`;
}

/**
 * Client-specific frontmatter keys stripped when syncing to incompatible clients.
 */
const CURSOR_ONLY_KEYS = ["argument-hint", "model"];
const CLAUDE_ONLY_KEYS = ["allowed_tools"];

/** Clients that DON'T understand Cursor command frontmatter */
const STRIP_CURSOR_KEYS_FOR: Set<AgentClientName> = new Set([
  "claude",
  "codex",
]);

/** Clients that DON'T understand Claude command frontmatter */
const STRIP_CLAUDE_KEYS_FOR: Set<AgentClientName> = new Set([
  "cursor",
  "windsurf",
  "cline",
  "roo",
]);

/**
 * Strip client-specific frontmatter keys from command content.
 * Uses regex for surgical removal to preserve formatting.
 */
function stripClientSpecificFrontmatter(
  content: string,
  keysToStrip: string[],
): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return content;

  let frontmatterYaml = match[1];
  let modified = false;

  for (const key of keysToStrip) {
    // Regex breakdown:
    // ^key:.*              - match "key:" and rest of line
    // (?:\n[ \t]+-.*)*     - plus any following array items (lines starting with -)
    // (?:\n[ \t]+\w+:.*)*  - plus any nested key: value pairs
    const keyRegex = new RegExp(
      `^${key}:.*(?:\\n(?:[ \\t]+-.*|[ \\t]+\\w+:.*))*`,
      "gm",
    );
    const newYaml = frontmatterYaml.replace(keyRegex, "");
    if (newYaml !== frontmatterYaml) {
      frontmatterYaml = newYaml;
      modified = true;
    }
  }

  if (!modified) return content;

  // Clean up empty lines in frontmatter
  frontmatterYaml = frontmatterYaml
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");

  const body = content.slice(match[0].length);
  return `---\n${frontmatterYaml}\n---\n${body}`;
}

/**
 * Transform content based on target client requirements.
 */
export function transformContentForClient(
  content: string,
  targetClient: AgentClientName,
  assetType: AssetType,
): string {
  // Transform agents for OpenCode
  if (targetClient === "opencode" && assetType === "agents") {
    return transformForOpenCode(content);
  }

  if (assetType === "commands") {
    if (STRIP_CURSOR_KEYS_FOR.has(targetClient)) {
      return stripClientSpecificFrontmatter(content, CURSOR_ONLY_KEYS);
    }
    if (STRIP_CLAUDE_KEYS_FOR.has(targetClient)) {
      return stripClientSpecificFrontmatter(content, CLAUDE_ONLY_KEYS);
    }
  }

  return content;
}
