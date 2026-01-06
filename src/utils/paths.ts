import path from 'node:path';
import type { AgentClientName, AssetType, AssetContent } from '../types/index.js';

const CLAUDE_FILE = 'claude.md';
const AGENTS_FILE = 'AGENTS.md';

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}

export function canonicalizeRelativePath(
  _client: AgentClientName,
  type: AssetType,
  relativePath: string
): string {
  const normalized = normalizeRelativePath(relativePath);
  if (type === 'agents') {
    if (normalized.toLowerCase() === CLAUDE_FILE) {
      return AGENTS_FILE;
    }
  }
  return normalized;
}

export function denormalizeRelativePath(
  client: AgentClientName,
  type: AssetType,
  canonicalPath: string
): string {
  if (type === 'agents' && client === 'claude' && canonicalPath === AGENTS_FILE) {
    return 'CLAUDE.md';
  }
  return canonicalPath;
}

export function buildTargetAbsolutePath(
  root: string,
  relativePath: string
): string {
  const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean);
  return path.join(root, ...segments);
}

export function resolveTargetRelativePath(
  targetClient: AgentClientName,
  asset: AssetContent
): string {
  const canonical = asset.canonicalPath ?? normalizeRelativePath(asset.relativePath);
  if (asset.client === targetClient) {
    return normalizeRelativePath(asset.relativePath);
  }
  return denormalizeRelativePath(targetClient, asset.type, canonical);
}
