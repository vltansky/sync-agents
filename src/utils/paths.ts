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
    if (normalized.toLowerCase() === CLAUDE_FILE) {
      return AGENTS_FILE;
    }
  }
  if (type === "skills" && client === "opencode") {
    return fromOpenCodeSkillPath(normalized);
  }
  if (type === "mcp") {
    return canonicalizeMcpPath(normalized);
  }
  return normalized;
}

export function denormalizeRelativePath(
  client: AgentClientName,
  type: AssetType,
  canonicalPath: string,
): string {
  if (type === "agents" && canonicalPath === AGENTS_FILE) {
    if (client === "claude") {
      return "CLAUDE.md";
    }
  }
  return canonicalPath;
}

export function getTargetMcpFilename(
  targetClient: AgentClientName,
  defs: ClientDefinition[],
): string | null {
  const def = defs.find((d) => d.name === targetClient);
  if (!def) return null;

  const mcpAsset = def.assets.find((a) => a.type === "mcp");
  if (!mcpAsset?.files?.length) return null;

  return mcpAsset.files[0];
}

export function canonicalizeMcpPath(relativePath: string): string {
  return CANONICAL_MCP_FILE;
}

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
  if (asset.type === "skills") {
    const flattened = flattenSkillPath(normalized);
    if (targetClient === "opencode") {
      return toOpenCodeSkillPath(flattened);
    }
    return flattened;
  }
  if (asset.type === "mcp" && defs) {
    const targetFile = denormalizeMcpPath(targetClient, defs);
    if (targetFile) {
      return targetFile;
    }
  }
  return normalized;
}

/**
 * Flatten nested skill directories into a single level.
 * Claude Code, Cursor, and Codex expect skills at `skills/<name>/SKILL.md`.
 * Nested paths like `skills/builder/steps/init/SKILL.md` are flattened to
 * `skills/builder-steps-init/SKILL.md` by joining intermediate segments with `-`.
 */
export function flattenSkillPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);

  // Find the SKILL.md at the end
  const skillIdx = segments.findIndex((s) => s.toLowerCase() === "skill.md");
  if (skillIdx < 0) return normalized;

  // Find the skills/ prefix
  const skillsPrefix =
    segments[0] === "skills" || segments[0] === "skill" ? segments[0] : null;
  if (!skillsPrefix) return normalized;

  // Get the intermediate segments (between skills/ and /SKILL.md)
  const middleSegments = segments.slice(1, skillIdx);
  if (middleSegments.length <= 1) {
    // Already flat (e.g. skills/review/SKILL.md)
    return normalized;
  }

  // Flatten: join intermediate segments with dash
  const flatName = middleSegments.join("-");

  // Preserve any content after SKILL.md (e.g. agents/openai.yaml in subdirectories)
  const rest = segments.slice(skillIdx);
  return [skillsPrefix, flatName, ...rest].join("/");
}

function fromOpenCodeSkillPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "skills/skill/SKILL.md";
  }
  const nameSegments = segments.slice(segments[0] === "skill" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("skills", ...nameSegments));
}

function toOpenCodeSkillPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "skill/skill/SKILL.md";
  }
  const nameSegments = segments.slice(segments[0] === "skills" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("skill", ...nameSegments));
}
