import path from 'node:path';
import fg from 'fast-glob';
import type { AgentClientName, AssetContent, AssetType, ClientDefinition } from '../types/index.js';
import { fileExists, hashContent, readFileSafe } from './fs.js';
import { canonicalizeRelativePath, normalizeRelativePath } from './paths.js';
import { getCursorHistoryRoot } from './cursorPaths.js';

interface DiscoveryFilters {
  types?: AssetType[];
  clients?: string[];
}

export async function discoverAssets(
  definitions: ClientDefinition[],
  filters: DiscoveryFilters = {}
): Promise<AssetContent[]> {
  const out: AssetContent[] = [];
  for (const def of definitions) {
    if (filters.clients && !filters.clients.includes(def.name)) {
      continue;
    }

    const rootExists = await fileExists(def.root);
    if (!rootExists) {
      continue;
    }

    for (const assetDef of def.assets) {
      if (filters.types && !filters.types.includes(assetDef.type)) {
        continue;
      }

      const matches = await fg(assetDef.patterns, {
        cwd: def.root,
        dot: true,
        onlyFiles: true,
        absolute: true,
        unique: true,
      });

      if (assetDef.files) {
        for (const rel of assetDef.files) {
          matches.push(path.join(def.root, rel));
        }
      }

      for (const absPath of matches) {
        const exists = await fileExists(absPath);
        if (!exists) {
          continue;
        }
        const content = await readFileSafe(absPath);
        if (content === null) {
          continue;
        }
        const relativeRaw = path.relative(def.root, absPath) || path.basename(absPath);
        const normalizedRelative = normalizeRelativePath(relativeRaw);
        let canonicalPath = canonicalizeRelativePath(def.name, assetDef.type, normalizedRelative);
        let metadata: Record<string, unknown> | undefined;

        if (def.name === 'cursor' && assetDef.type === 'rules') {
          const classification = classifyCursorRule(content);
          if (classification?.alwaysApply === false) {
            canonicalPath = buildCursorConditionalCanonicalPath(normalizedRelative);
          }
          metadata = { cursorRule: classification };
        }

        out.push({
          client: def.name,
          type: assetDef.type,
          path: absPath,
          relativePath: normalizedRelative,
          canonicalPath,
          name: deriveAssetName(def.root, absPath),
          content,
          hash: hashContent(content),
          metadata,
        });
      }
    }

    if (def.name === 'cursor') {
      const historyAssets = await discoverCursorHistory(def.name);
      out.push(...historyAssets);
    }
  }
  return out;
}

function deriveAssetName(root: string, absPath: string): string {
  const relative = path.relative(root, absPath);
  const normalized = relative.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const file = segments.pop() ?? normalized;
  const withoutExt = file.replace(/\.[^.]+$/, '');
  return `${segments.join('/')}${segments.length ? '/' : ''}${withoutExt}`.replace(/\/$/, '') || withoutExt;
}

function classifyCursorRule(content: string): { alwaysApply?: boolean } | undefined {
  const match = content.match(/---\s*([\s\S]*?)---/);
  if (!match) {
    return undefined;
  }
  const alwaysMatch = match[1].match(/alwaysApply\s*:\s*(true|false)/i);
  if (!alwaysMatch) {
    return undefined;
  }
  return { alwaysApply: alwaysMatch[1].toLowerCase() === 'true' };
}

function buildCursorConditionalCanonicalPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const withoutRules = normalized.replace(/^rules\/?/, '');
  return normalizeRelativePath(path.posix.join('skills', 'cursor-rules', withoutRules));
}

async function discoverCursorHistory(clientName: AgentClientName): Promise<AssetContent[]> {
  const historyRoot = getCursorHistoryRoot();
  const exists = await fileExists(historyRoot);
  if (!exists) {
    return [];
  }

  const matches = await fg(['**/*.md'], {
    cwd: historyRoot,
    dot: true,
    onlyFiles: true,
    unique: true,
  });

  const assets: AssetContent[] = [];
  for (const rel of matches) {
    const absPath = path.join(historyRoot, rel);
    const content = await readFileSafe(absPath);
    if (content === null) {
      continue;
    }
    const normalizedRel = normalizeRelativePath(path.join('cursor-history', rel));
    assets.push({
      client: clientName,
      type: 'rules',
      path: absPath,
      relativePath: normalizedRel,
      canonicalPath: normalizeRelativePath(path.posix.join('rules', normalizedRel)),
      name: deriveAssetName(historyRoot, absPath),
      content,
      hash: hashContent(content),
      metadata: { cursorHistory: true },
    });
  }
  return assets;
}
