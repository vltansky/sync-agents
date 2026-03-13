import type { AgentClientName, AssetContent } from "../types/index.js";

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

  // All candidates have the same content — pick the newest, no need to ask
  const allIdentical = candidates.every((c) => c.hash === candidates[0].hash);
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
