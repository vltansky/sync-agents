import type {
  AgentClientName,
  AssetContent,
  SyncOptions,
} from "../types/index.js";

export function shouldSkipTargetAsset(
  options: Pick<SyncOptions, "separateClaudeMd">,
  targetClient: AgentClientName,
  asset: Pick<AssetContent, "type" | "canonicalPath" | "relativePath">,
): boolean {
  const canonicalPath = asset.canonicalPath ?? asset.relativePath;

  return (
    Boolean(options.separateClaudeMd) &&
    targetClient === "claude" &&
    asset.type === "agents" &&
    canonicalPath === "AGENTS.md"
  );
}
