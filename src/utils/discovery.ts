import path from "node:path";
import fg from "fast-glob";
import type {
  AssetContent,
  AssetType,
  ClientDefinition,
} from "../types/index.js";
import { fileExists, hashContent, readFileSafe, getFileMtime } from "./fs.js";
import { canonicalizeRelativePath, normalizeRelativePath } from "./paths.js";

interface DiscoveryFilters {
  types?: AssetType[];
  clients?: string[];
}

export async function discoverAssets(
  definitions: ClientDefinition[],
  filters: DiscoveryFilters = {},
): Promise<AssetContent[]> {
  const out: AssetContent[] = [];
  for (const def of definitions) {
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
        const modifiedAt = await getFileMtime(absPath);
        const relativeRaw =
          path.relative(def.root, absPath) || path.basename(absPath);
        const normalizedRelative = normalizeRelativePath(relativeRaw);
        let canonicalPath = canonicalizeRelativePath(
          def.name,
          assetDef.type,
          normalizedRelative,
        );
        let metadata: Record<string, unknown> | undefined;

        if (def.name === "cursor" && assetDef.type === "rules") {
          const classification = classifyCursorRule(content);
          if (classification?.alwaysApply === false) {
            canonicalPath =
              buildCursorConditionalCanonicalPath(normalizedRelative);
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
          modifiedAt: modifiedAt ?? undefined,
        });
      }
    }

    // NOTE: Cursor history discovery disabled - it includes editor file history
    // (backups of all edited files), not agent rules.
  }
  return out;
}

function deriveAssetName(root: string, absPath: string): string {
  const relative = path.relative(root, absPath);
  const normalized = relative.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const file = segments.pop() ?? normalized;
  const withoutExt = file.replace(/\.[^.]+$/, "");
  return (
    `${segments.join("/")}${segments.length ? "/" : ""}${withoutExt}`.replace(
      /\/$/,
      "",
    ) || withoutExt
  );
}

function classifyCursorRule(
  content: string,
): { alwaysApply?: boolean } | undefined {
  const match = content.match(/---\s*([\s\S]*?)---/);
  if (!match) {
    return undefined;
  }
  const alwaysMatch = match[1].match(/alwaysApply\s*:\s*(true|false)/i);
  if (!alwaysMatch) {
    return undefined;
  }
  return { alwaysApply: alwaysMatch[1].toLowerCase() === "true" };
}

function buildCursorConditionalCanonicalPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const withoutRules = normalized.replace(/^rules\/?/, "");
  return normalizeRelativePath(
    path.posix.join("skills", "cursor-rules", withoutRules),
  );
}
