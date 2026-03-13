import type { AgentClientName, AssetContent } from "../types/index.js";
import { normalizeForComparison } from "./frontmatter.js";
import { hashContent } from "./fs.js";

interface BootstrapResolutionInput {
  canonicalPath: string;
  candidates: AssetContent[];
  bootstrapSource?: AgentClientName;
}

type BootstrapResolution =
  | { status: "missing" }
  | { status: "selected"; asset: AssetContent }
  | { status: "ambiguous"; candidates: AssetContent[] };

export function getBootstrapResolution(
  input: BootstrapResolutionInput,
): BootstrapResolution {
  const { candidates, bootstrapSource, canonicalPath } = input;

  if (candidates.length === 0) {
    return { status: "missing" };
  }

  if (bootstrapSource) {
    const matches = candidates.filter(
      (asset) => asset.client === bootstrapSource,
    );
    if (matches.length === 0) {
      throw new Error(
        `bootstrap-source ${bootstrapSource} is not available for ${canonicalPath}`,
      );
    }
    if (matches.length === 1) {
      return { status: "selected", asset: matches[0] };
    }
    return { status: "ambiguous", candidates: matches };
  }

  if (candidates.length === 1) {
    return { status: "selected", asset: candidates[0] };
  }

  // Compare normalized content — strips client-specific frontmatter keys
  // so files that only differ in e.g. argument-hint or allowed_tools are
  // treated as identical.
  const normalizedHashes = candidates.map((c) =>
    hashContent(normalizeForComparison(c.content)),
  );
  const allIdentical = normalizedHashes.every((h) => h === normalizedHashes[0]);
  if (allIdentical) {
    const newest = [...candidates].sort((a, b) => {
      const ta = a.modifiedAt?.getTime() ?? 0;
      const tb = b.modifiedAt?.getTime() ?? 0;
      return tb - ta;
    });
    return { status: "selected", asset: newest[0] };
  }

  return { status: "ambiguous", candidates };
}
