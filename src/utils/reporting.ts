import os from "node:os";
import path from "node:path";
import type {
  AppliedEntry,
  ManagedAssetType,
  SyncPlanEntry,
} from "../types/index.js";

const TYPE_ORDER: ManagedAssetType[] = ["agents", "skills", "mcp"];
const TYPE_LABELS: Record<ManagedAssetType, string> = {
  agents: "AGENTS.md",
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
    : "agents, skills, mcp";
  const targets = input.targets.length > 0 ? input.targets.join(", ") : "none";

  return [
    `Mode: ${input.dryRun ? "dry-run" : "apply"}`,
    `Write mode: ${input.writeMode}`,
    `Canonical assets: ${input.canonicalCount}`,
    `Imported from clients: ${input.bootstrapCount}`,
    `Ignored legacy inputs: ${input.ignoredCount}`,
    `Targets: ${targets}`,
    `Managed types: ${types}`,
  ];
}

export function buildSyncPlanSummaryLines(plan: SyncPlanEntry[]): string[] {
  const importEntries = plan.filter((entry) => entry.reason === "import");
  const syncEntries = plan.filter((entry) => entry.reason !== "import");
  const lines: string[] = [];

  if (importEntries.length > 0) {
    lines.push(`import      ${formatEntrySummary(importEntries)}`);
  }

  const byClient = new Map<string, SyncPlanEntry[]>();
  for (const entry of syncEntries) {
    const entries = byClient.get(entry.targetClient) ?? [];
    entries.push(entry);
    byClient.set(entry.targetClient, entries);
  }

  for (const [client, entries] of [...byClient.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`sync        ${client}: ${formatEntrySummary(entries)}`);
  }

  return lines;
}

export function buildDetailedPlanLines(plan: SyncPlanEntry[]): string[] {
  return plan.map((entry) => {
    const phase = entry.reason === "import" ? "import" : "sync";
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

function countMcpServers(content: string): number {
  try {
    const parsed = JSON.parse(content);
    return Object.keys(parsed.mcpServers ?? parsed.mcp ?? {}).length;
  } catch {
    return 1;
  }
}

function formatEntrySummary(entries: SyncPlanEntry[]): string {
  const counts = new Map<ManagedAssetType, number>();

  for (const type of TYPE_ORDER) {
    counts.set(type, 0);
  }

  for (const entry of entries) {
    if (!isManagedAssetType(entry.asset.type)) continue;

    if (entry.asset.type === "mcp") {
      counts.set("mcp", countMcpServers(entry.asset.content));
    } else {
      counts.set(entry.asset.type, (counts.get(entry.asset.type) ?? 0) + 1);
    }
  }

  const details = TYPE_ORDER.map((type) => {
    const count = counts.get(type) ?? 0;
    if (count === 0) {
      return null;
    }
    if (type === "agents") return TYPE_LABELS[type];
    return `${count} ${TYPE_LABELS[type]}`;
  }).filter((item): item is string => item !== null);

  return `${entries.length} change${entries.length === 1 ? "" : "s"} (${details.join(", ")})`;
}

function isManagedAssetType(type: string): type is ManagedAssetType {
  return TYPE_ORDER.includes(type as ManagedAssetType);
}

export function buildSyncTreeLines(
  entries: AppliedEntry[],
  clientRoots: Map<string, string>,
): string[] {
  if (entries.length === 0) return [];

  const byClient = new Map<string, AppliedEntry[]>();
  for (const entry of entries) {
    const bucket = byClient.get(entry.targetClient) ?? [];
    bucket.push(entry);
    byClient.set(entry.targetClient, bucket);
  }

  const clientOrder = [
    "canonical",
    ...[...byClient.keys()].filter((k) => k !== "canonical").sort(),
  ].filter((k) => byClient.has(k));

  const roots = clientOrder.map((c) => abbreviateHome(clientRoots.get(c) ?? c));
  const maxRootLen = Math.max(...roots.map((r) => r.length + 1)); // +1 for trailing /
  const padWidth = Math.max(maxRootLen + 2, 24);

  const lines: string[] = [];

  for (let i = 0; i < clientOrder.length; i++) {
    const client = clientOrder[i];
    const clientEntries = byClient.get(client)!;
    const rootDisplay = roots[i] + "/";

    const typeCounts = new Map<ManagedAssetType, number>();
    for (const entry of clientEntries) {
      if (!isManagedAssetType(entry.assetType)) continue;

      if (entry.assetType === "mcp" && entry.mcpServerCount) {
        typeCounts.set("mcp", entry.mcpServerCount);
      } else {
        typeCounts.set(
          entry.assetType,
          (typeCounts.get(entry.assetType) ?? 0) + 1,
        );
      }
    }

    const typeStr = TYPE_ORDER.filter((t) => (typeCounts.get(t) ?? 0) > 0)
      .map((t) => {
        if (t === "agents") return TYPE_LABELS[t];
        return `${typeCounts.get(t)} ${TYPE_LABELS[t]}`;
      })
      .join(", ");

    let modeStr = "";
    if (client !== "canonical") {
      const linked = clientEntries.filter(
        (e) => e.writeMode === "symlink",
      ).length;
      const copied = clientEntries.filter((e) => e.writeMode === "copy").length;
      const parts: string[] = [];
      if (linked > 0) parts.push(`${linked} linked`);
      if (copied > 0) parts.push(`${copied} copied`);
      if (parts.length > 0) {
        modeStr = `  (${parts.join(", ")})`;
      }
    }

    lines.push(`${rootDisplay.padEnd(padWidth)}${typeStr}${modeStr}`);
  }

  return lines;
}

export function abbreviateHome(absPath: string): string {
  const home = os.homedir();
  if (absPath.startsWith(home + path.sep) || absPath === home) {
    return "~" + absPath.slice(home.length);
  }
  const cwd = process.cwd();
  const relative = path.relative(cwd, absPath);
  if (relative && !relative.startsWith("..")) {
    return relative;
  }
  return absPath;
}
