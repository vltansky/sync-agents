import path from "node:path";
import type {
  AgentClientName,
  AssetType,
  AssetContent,
  ClientDefinition,
} from "../types/index.js";

const CLAUDE_FILE = "claude.md";
const AGENTS_FILE = "AGENTS.md";

// Canonical MCP filename used for cross-client matching
const CANONICAL_MCP_FILE = "mcp.json";

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

export function canonicalizeRelativePath(
  client: AgentClientName,
  type: AssetType,
  relativePath: string,
): string {
  const normalized = normalizeRelativePath(relativePath);
  if (type === "agents") {
    // Canonicalize CLAUDE.md to AGENTS.md
    if (normalized.toLowerCase() === CLAUDE_FILE) {
      return AGENTS_FILE;
    }
  }
  // Codex stores commands in prompts/ - canonicalize to commands/ to match other clients
  if (type === "commands" && client === "codex") {
    return fromPromptPath(normalized);
  }
  // OpenCode uses singular: command/ - canonicalize to commands/
  if (type === "commands" && client === "opencode") {
    return fromOpenCodeCommandPath(normalized);
  }
  // OpenCode uses singular: skill/ - canonicalize to skills/
  if (type === "skills" && client === "opencode") {
    return fromOpenCodeSkillPath(normalized);
  }
  // MCP configs have different filenames per client - canonicalize for matching
  if (type === "mcp") {
    return canonicalizeMcpPath(normalized);
  }
  return normalized;
}

/** Convert Codex prompts/ path to canonical commands/ path */
function fromPromptPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "commands/command.md";
  }
  // Strip "prompts" prefix if present
  const nameSegments = segments.slice(segments[0] === "prompts" ? 1 : 0);
  const fileName = nameSegments.join("/");
  return normalizeRelativePath(path.posix.join("commands", fileName));
}

export function denormalizeRelativePath(
  client: AgentClientName,
  type: AssetType,
  canonicalPath: string,
): string {
  if (type === "agents" && canonicalPath === AGENTS_FILE) {
    // Claude Code uses CLAUDE.md
    if (client === "claude") {
      return "CLAUDE.md";
    }
    // OpenCode uses AGENTS.md (same as Cursor/Codex)
    // See: https://opencode.ai/docs/rules/
  }
  return canonicalPath;
}

/**
 * Get the target MCP filename for a client.
 * Each client has its own expected MCP config filename (e.g., mcp.json, config.toml).
 */
export function getTargetMcpFilename(
  targetClient: AgentClientName,
  defs: ClientDefinition[],
): string | null {
  const def = defs.find((d) => d.name === targetClient);
  if (!def) return null;

  const mcpAsset = def.assets.find((a) => a.type === "mcp");
  if (!mcpAsset?.files?.length) return null;

  // Return the first (primary) MCP filename for this client
  return mcpAsset.files[0];
}

/**
 * Canonicalize MCP filename for cross-client matching.
 * All MCP configs map to a single canonical name so they can be compared/merged.
 */
export function canonicalizeMcpPath(relativePath: string): string {
  // All MCP configs are semantically equivalent, use canonical name for matching
  return CANONICAL_MCP_FILE;
}

/**
 * Denormalize MCP path for a target client.
 * Converts canonical MCP path to the client-specific filename.
 */
export function denormalizeMcpPath(
  targetClient: AgentClientName,
  defs: ClientDefinition[],
): string | null {
  return getTargetMcpFilename(targetClient, defs);
}

export function buildTargetAbsolutePath(
  root: string,
  relativePath: string,
): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  return path.join(root, ...segments);
}

export function resolveTargetRelativePath(
  targetClient: AgentClientName,
  asset: AssetContent,
): string {
  const canonical =
    asset.canonicalPath ?? normalizeRelativePath(asset.relativePath);
  if (asset.client === targetClient) {
    return normalizeRelativePath(asset.relativePath);
  }
  return denormalizeRelativePath(targetClient, asset.type, canonical);
}

export function remapRelativePathForTarget(
  asset: AssetContent,
  targetClient: AgentClientName,
  relativePath: string,
  defs?: ClientDefinition[],
): string {
  const normalized = normalizeRelativePath(relativePath);
  if (asset.type === "commands" && targetClient === "codex") {
    return toPromptPath(normalized);
  }
  // OpenCode uses singular: command/ instead of commands/
  if (asset.type === "commands" && targetClient === "opencode") {
    return toOpenCodeCommandPath(normalized);
  }
  // OpenCode uses singular: skill/ instead of skills/
  if (asset.type === "skills" && targetClient === "opencode") {
    return toOpenCodeSkillPath(normalized);
  }
  // MCP configs need client-specific filenames
  if (asset.type === "mcp" && defs) {
    const targetFile = denormalizeMcpPath(targetClient, defs);
    if (targetFile) {
      return targetFile;
    }
  }
  return normalized;
}

/** Convert canonical commands/ path to Codex prompts/ path */
function toPromptPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "prompts/command.md";
  }
  // Strip "commands" prefix if present, preserve nested folder structure
  const nameSegments = segments.slice(segments[0] === "commands" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("prompts", ...nameSegments));
}

/** Convert OpenCode command/ (singular) to canonical commands/ (plural) */
function fromOpenCodeCommandPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "commands/command.md";
  }
  // Strip "command" prefix if present
  const nameSegments = segments.slice(segments[0] === "command" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("commands", ...nameSegments));
}

/** Convert canonical commands/ to OpenCode command/ (singular) */
function toOpenCodeCommandPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "command/command.md";
  }
  // Strip "commands" prefix if present
  const nameSegments = segments.slice(segments[0] === "commands" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("command", ...nameSegments));
}

/** Convert OpenCode skill/ (singular) to canonical skills/ (plural) */
function fromOpenCodeSkillPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "skills/skill/SKILL.md";
  }
  // Strip "skill" prefix if present
  const nameSegments = segments.slice(segments[0] === "skill" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("skills", ...nameSegments));
}

/** Convert canonical skills/ to OpenCode skill/ (singular) */
function toOpenCodeSkillPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "skill/skill/SKILL.md";
  }
  // Strip "skills" prefix if present
  const nameSegments = segments.slice(segments[0] === "skills" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("skill", ...nameSegments));
}
