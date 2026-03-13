import path from "node:path";
import type {
  AgentClientName,
  AssetType,
  AssetContent,
  ClientDefinition,
} from "../types/index.js";

const CLAUDE_FILE = "claude.md";
const AGENTS_FILE = "AGENTS.md";
const CODEX_COMMANDS_ROOT = "skills/commands";

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
  if (type === "commands" && client === "codex") {
    return fromCodexCommandPath(normalized);
  }
  if (type === "commands" && client === "opencode") {
    return fromOpenCodeCommandPath(normalized);
  }
  if (type === "skills" && client === "opencode") {
    return fromOpenCodeSkillPath(normalized);
  }
  if (type === "mcp") {
    return canonicalizeMcpPath(normalized);
  }
  return normalized;
}

function fromCodexCommandPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.startsWith("prompts/")) {
    return fromPromptPath(normalized);
  }
  if (
    normalized.startsWith(`${CODEX_COMMANDS_ROOT}/`) &&
    normalized.endsWith("/SKILL.md")
  ) {
    const commandPath = normalized
      .slice(`${CODEX_COMMANDS_ROOT}/`.length, -"/SKILL.md".length)
      .split("/")
      .filter(Boolean)
      .join("/");
    return normalizeRelativePath(
      path.posix.join("commands", `${commandPath}.md`),
    );
  }
  return fromPromptPath(normalized);
}

function fromPromptPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "commands/command.md";
  }
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
  if (asset.type === "commands" && targetClient === "codex") {
    return toCodexCommandSkillPath(normalized);
  }
  if (asset.type === "commands" && targetClient === "opencode") {
    return toOpenCodeCommandPath(normalized);
  }
  if (asset.type === "skills" && targetClient === "opencode") {
    return toOpenCodeSkillPath(normalized);
  }
  if (asset.type === "mcp" && defs) {
    const targetFile = denormalizeMcpPath(targetClient, defs);
    if (targetFile) {
      return targetFile;
    }
  }
  return normalized;
}

function toCodexCommandSkillPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return `${CODEX_COMMANDS_ROOT}/command/SKILL.md`;
  }
  const nameSegments = segments.slice(segments[0] === "commands" ? 1 : 0);
  const fileName = nameSegments.join("/").replace(/\.md$/i, "");
  return normalizeRelativePath(
    path.posix.join(CODEX_COMMANDS_ROOT, fileName, "SKILL.md"),
  );
}

function fromOpenCodeCommandPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "commands/command.md";
  }
  const nameSegments = segments.slice(segments[0] === "command" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("commands", ...nameSegments));
}

function toOpenCodeCommandPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "command/command.md";
  }
  const nameSegments = segments.slice(segments[0] === "commands" ? 1 : 0);
  return normalizeRelativePath(path.posix.join("command", ...nameSegments));
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
