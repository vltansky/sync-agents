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
    const match = candidates.find((asset) => asset.client === bootstrapSource);
    if (!match) {
      throw new Error(
        `bootstrap-source ${bootstrapSource} is not available for ${canonicalPath}`,
      );
    }
    return { status: "selected", asset: match };
  }

  if (candidates.length === 1) {
    return { status: "selected", asset: candidates[0] };
  }

  return { status: "ambiguous", candidates };
}
