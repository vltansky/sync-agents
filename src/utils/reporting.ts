import type { ManagedAssetType, SyncPlanEntry } from "../types/index.js";

const TYPE_ORDER: ManagedAssetType[] = ["agents", "commands", "skills", "mcp"];
const TYPE_LABELS: Record<ManagedAssetType, string> = {
  agents: "agents",
  commands: "commands",
  skills: "skills",
  mcp: "mcp",
};

interface SyncPreflightInput {
  canonicalCount: number;
  bootstrapCount: number;
  ignoredCount: number;
  targets: string[];
  writeMode: "symlink" | "copy";
  dryRun: boolean;
  types?: ManagedAssetType[];
}

export function buildSyncPreflightLines(input: SyncPreflightInput): string[] {
  const types = input.types?.length
    ? input.types.join(", ")
    : "agents, commands, skills, mcp";
  const targets = input.targets.length > 0 ? input.targets.join(", ") : "none";

  return [
    `Mode: ${input.dryRun ? "dry-run" : "apply"}`,
    `Write mode: ${input.writeMode}`,
    `Canonical assets: ${input.canonicalCount}`,
    `Bootstrap actions: ${input.bootstrapCount}`,
    `Ignored legacy inputs: ${input.ignoredCount}`,
    `Targets: ${targets}`,
    `Managed types: ${types}`,
  ];
}

export function buildSyncPlanSummaryLines(plan: SyncPlanEntry[]): string[] {
  const bootstrapEntries = plan.filter((entry) => entry.reason === "bootstrap");
  const fanoutEntries = plan.filter((entry) => entry.reason !== "bootstrap");
  const lines: string[] = [];

  if (bootstrapEntries.length > 0) {
    lines.push(`bootstrap   ${formatEntrySummary(bootstrapEntries)}`);
  }

  const byClient = new Map<string, SyncPlanEntry[]>();
  for (const entry of fanoutEntries) {
    const entries = byClient.get(entry.targetClient) ?? [];
    entries.push(entry);
    byClient.set(entry.targetClient, entries);
  }

  for (const [client, entries] of [...byClient.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`fanout      ${client}: ${formatEntrySummary(entries)}`);
  }

  return lines;
}

export function buildDetailedPlanLines(plan: SyncPlanEntry[]): string[] {
  return plan.map((entry) => {
    const phase = entry.reason === "bootstrap" ? "bootstrap" : "fanout";
    return `${phase.padEnd(10)} ${entry.targetPath}`;
  });
}

export function formatIssueSection(title: string, items: string[]): string[] {
  if (items.length === 0) {
    return [];
  }

  return [
    `${title} (${items.length})`,
    ...items.map((item) => `  ${item}`),
    "",
  ];
}

export function formatSnapshotList(
  snapshots: Array<{ id: string; createdAt: string; entries: unknown[] }>,
): string[] {
  return snapshots.map(
    (snapshot) =>
      `${snapshot.id}  ${snapshot.createdAt}  (${snapshot.entries.length} paths)`,
  );
}

function formatEntrySummary(entries: SyncPlanEntry[]): string {
  const counts = new Map<ManagedAssetType, number>();

  for (const type of TYPE_ORDER) {
    counts.set(type, 0);
  }

  for (const entry of entries) {
    if (isManagedAssetType(entry.asset.type)) {
      counts.set(entry.asset.type, (counts.get(entry.asset.type) ?? 0) + 1);
    }
  }

  const details = TYPE_ORDER.map((type) => {
    const count = counts.get(type) ?? 0;
    if (count === 0) {
      return null;
    }
    return `${TYPE_LABELS[type]} ${count}`;
  }).filter((item): item is string => item !== null);

  return `${entries.length} change${entries.length === 1 ? "" : "s"} (${details.join(", ")})`;
}

function isManagedAssetType(type: string): type is ManagedAssetType {
  return TYPE_ORDER.includes(type as ManagedAssetType);
}
