import type { AgentClientName, AssetContent } from "../types/index.js";

export function shouldSkipTargetAsset(
  _options: unknown,
  targetClient: AgentClientName,
  asset: Pick<AssetContent, "type" | "canonicalPath" | "relativePath">,
): boolean {
  void targetClient;
  void asset;
  return false;
}
