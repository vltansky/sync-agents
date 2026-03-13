import type { AssetContent, ClientDefinition } from "../types/index.js";
import { clientSupportsAssetType } from "../clients/definitions.js";

/**
 * Merge rules into agents content for clients that don't support separate rules.
 *
 * When syncing to a client that doesn't support rules (e.g., Claude Code),
 * rules should be concatenated into the AGENTS.md file.
 */
export function mergeRulesIntoAgents(
  agentContent: string,
  rules: AssetContent[],
): string {
  if (rules.length === 0) {
    return agentContent;
  }

  const rulesSections = rules
    .map((rule) => {
      const header = `## Rule: ${rule.name}`;
      return `${header}\n\n${rule.content.trim()}`;
    })
    .join("\n\n---\n\n");

  const separator = "\n\n---\n\n# Rules\n\n";

  // Check if agent content already has a rules section
  const rulesMarker = /\n---\n+# Rules\n/i;
  if (rulesMarker.test(agentContent)) {
    // Replace existing rules section
    return agentContent.replace(rulesMarker, separator) + rulesSections;
  }

  return agentContent.trim() + separator + rulesSections;
}

/**
 * Check if rules should be merged into agents for a target client.
 */
export function shouldMergeRulesIntoAgents(
  targetDef: ClientDefinition,
): boolean {
  return !clientSupportsAssetType(targetDef, "rules");
}

/**
 * Get rules that should be merged into agents for a target client.
 */
export function getRulesForMerge(
  assets: AssetContent[],
  sourceClient?: string,
): AssetContent[] {
  return assets.filter((a) => {
    if (a.type !== "rules") return false;
    if (sourceClient && a.client !== sourceClient) return false;
    return true;
  });
}
