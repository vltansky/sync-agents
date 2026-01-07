import path from "node:path";
import type {
  AgentClientName,
  AssetType,
  AssetContent,
} from "../types/index.js";

const CLAUDE_FILE = "claude.md";
const AGENTS_FILE = "AGENTS.md";

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
  // Codex stores commands in prompts/ - canonicalize to commands/ to match other clients
  if (type === "commands" && client === "codex") {
    return fromPromptPath(normalized);
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
  if (
    type === "agents" &&
    client === "claude" &&
    canonicalPath === AGENTS_FILE
  ) {
    return "CLAUDE.md";
  }
  return canonicalPath;
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
): string {
  const normalized = normalizeRelativePath(relativePath);
  if (asset.type === "commands" && targetClient === "codex") {
    return toPromptPath(normalized);
  }
  return normalized;
}

function toPromptPath(relativePath: string): string {
  const segments = normalizeRelativePath(relativePath)
    .split("/")
    .filter(Boolean);
  if (segments.length === 0) {
    return "prompts/command.md";
  }
  const nameSegments = segments.slice(segments[0] === "commands" ? 1 : 0);
  const fileName = nameSegments.join("-");
  return normalizeRelativePath(path.posix.join("prompts", fileName));
}
