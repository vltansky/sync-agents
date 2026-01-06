import {
  intro,
  outro,
  select,
  multiselect,
  confirm,
  spinner,
  note,
} from "@clack/prompts";
import chalk from "chalk";
import type {
  AssetContent,
  AssetConflict,
  ClientDefinition,
  ScanResult,
  SyncDirection,
  SyncOptions,
  SyncPlanEntry,
  SyncScope,
} from "../types/index.js";
import { discoverAssets } from "../utils/discovery.js";
import { fileExists } from "../utils/fs.js";

export interface InteractiveResult {
  proceed: boolean;
  entries: SyncPlanEntry[];
  scope: SyncScope;
  direction: SyncDirection;
}

export async function runInteractiveFlow(
  defs: ClientDefinition[],
  options: SyncOptions,
): Promise<InteractiveResult> {
  intro(chalk.bold("sync-agents"));

  const scope =
    options.scope === "all" ? await selectScope() : options.scope ?? "all";
  if (typeof scope === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope: "all", direction: "sync" };
  }

  const s = spinner();
  s.start("Scanning for assets...");

  const scanResults = await scanAllClients(defs, scope);
  s.stop("Scan complete.");

  displayScanResults(scanResults);

  const projectAssets =
    scanResults.find((r) => r.client === "project")?.assets ?? [];
  const globalAssets = scanResults
    .filter((r) => r.client !== "project" && r.found)
    .flatMap((r) => r.assets);

  const allAssets = [...projectAssets, ...globalAssets];

  if (allAssets.length === 0) {
    note(
      "No assets found. Create an AGENTS.md or rules to get started.",
      "Empty",
    );
    outro("Nothing to sync.");
    return { proceed: false, entries: [], scope, direction: "sync" };
  }

  const conflicts = detectConflicts(allAssets);

  if (conflicts.length > 0) {
    console.log();
    console.log(chalk.bold.yellow(`Found ${conflicts.length} conflict(s):`));
    console.log();

    for (const conflict of conflicts) {
      await displayConflict(conflict);
      const resolution = await resolveConflict(conflict);
      if (typeof resolution === "symbol") {
        outro("Cancelled.");
        return { proceed: false, entries: [], scope, direction: "sync" };
      }
      conflict.resolution = resolution;
    }
  }

  const direction: SyncDirection | symbol =
    options.direction && options.direction !== "sync"
      ? options.direction
      : await selectDirection(scope);
  if (typeof direction === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: "sync" };
  }

  const resolvedDirection: SyncDirection = direction;

  const targetClients = await selectTargetClients(
    scanResults,
    scope,
    resolvedDirection,
  );
  if (typeof targetClients === "symbol" || targetClients.length === 0) {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: "sync" };
  }

  const plan = buildPlanFromConflicts(
    allAssets,
    conflicts,
    targetClients,
    defs,
    resolvedDirection,
  );

  if (plan.length === 0) {
    note("All clients are already in sync.", "Up to date");
    outro("Nothing to do.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  console.log();
  console.log(chalk.bold("Planned changes:"));
  for (const entry of plan) {
    const icon = entry.action === "create" ? chalk.green("+") : chalk.blue("~");
    console.log(
      `  ${icon} ${entry.targetClient} :: ${entry.targetRelativePath ?? entry.asset.relativePath}`,
    );
  }
  console.log();

  const confirmed = await confirm({
    message: `Apply ${plan.length} change(s)?`,
    active: "Yes",
    inactive: "No",
  });

  if (!confirmed || typeof confirmed === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  outro("Applying changes...");
  return { proceed: true, entries: plan, scope, direction: resolvedDirection };
}

async function selectScope(): Promise<SyncScope | symbol> {
  const result = await select({
    message: "What would you like to sync?",
    options: [
      {
        value: "project",
        label: "Project files only",
        hint: "./AGENTS.md, ./rules/*, etc.",
      },
      {
        value: "global",
        label: "Global configs only",
        hint: "~/.cursor, ~/.claude, etc.",
      },
      { value: "all", label: "Everything", hint: "Project + Global" },
    ],
  });
  return result as SyncScope | symbol;
}

async function selectDirection(
  scope: SyncScope,
): Promise<SyncDirection | symbol> {
  if (scope === "global") {
    return "sync";
  }

  const result = await select({
    message: "Sync direction:",
    options: [
      {
        value: "push",
        label: "Project → Global",
        hint: "Push project rules to all clients",
      },
      {
        value: "pull",
        label: "Global → Project",
        hint: "Pull client rules into project",
      },
      {
        value: "sync",
        label: "Merge all",
        hint: "Combine and sync everywhere",
      },
    ],
  });
  return result as SyncDirection | symbol;
}

async function selectTargetClients(
  scanResults: ScanResult[],
  scope: SyncScope,
  direction: SyncDirection,
): Promise<string[] | symbol> {
  const availableClients = scanResults.filter((r) => {
    if (scope === "project") return r.client === "project";
    if (scope === "global") return r.client !== "project";
    return true;
  });

  if (direction === "push") {
    const globalClients = scanResults.filter((r) => r.client !== "project");
    const result = await multiselect({
      message: "Sync to which clients?",
      options: globalClients.map((r) => ({
        value: r.client,
        label: r.displayName,
        hint: r.found ? `${r.assets.length} assets` : "will create",
      })),
      initialValues: globalClients.filter((r) => r.found).map((r) => r.client),
    });
    return result as string[] | symbol;
  }

  if (direction === "pull") {
    return ["project"];
  }

  const result = await multiselect({
    message: "Sync to which clients?",
    options: availableClients.map((r) => ({
      value: r.client,
      label: r.displayName,
      hint: r.found ? `${r.assets.length} assets` : "will create",
    })),
    initialValues: availableClients.filter((r) => r.found).map((r) => r.client),
  });
  return result as string[] | symbol;
}

async function scanAllClients(
  defs: ClientDefinition[],
  scope: SyncScope,
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const def of defs) {
    if (scope === "project" && def.name !== "project") continue;
    if (scope === "global" && def.name === "project") continue;

    const exists = await fileExists(def.root);
    if (!exists) {
      results.push({
        client: def.name,
        displayName: def.displayName,
        found: false,
        assets: [],
        root: def.root,
      });
      continue;
    }

    const assets = await discoverAssets([def], {});
    results.push({
      client: def.name,
      displayName: def.displayName,
      found: true,
      assets,
      root: def.root,
    });
  }

  return results;
}

function displayScanResults(results: ScanResult[]): void {
  console.log();
  for (const result of results) {
    if (result.found) {
      console.log(
        `  ${chalk.green("✓")} ${result.displayName.padEnd(12)} - ${result.assets.length} asset(s)`,
      );
    } else {
      console.log(
        `  ${chalk.gray("✗")} ${result.displayName.padEnd(12)} - not found`,
      );
    }
  }
  console.log();
}

function detectConflicts(assets: AssetContent[]): AssetConflict[] {
  const byKey = new Map<string, AssetContent[]>();

  for (const asset of assets) {
    const key = `${asset.type}::${asset.canonicalPath ?? asset.relativePath}`;
    const existing = byKey.get(key) ?? [];
    existing.push(asset);
    byKey.set(key, existing);
  }

  const conflicts: AssetConflict[] = [];
  for (const [key, versions] of byKey.entries()) {
    const uniqueHashes = new Set(versions.map((v) => v.hash));
    if (uniqueHashes.size > 1) {
      conflicts.push({
        canonicalKey: key,
        type: versions[0].type,
        versions,
      });
    }
  }

  return conflicts;
}

async function displayConflict(conflict: AssetConflict): Promise<void> {
  const [type, path] = conflict.canonicalKey.split("::");
  console.log(chalk.yellow(`  ${path} (${type})`));

  for (const version of conflict.versions) {
    const size = (version.content.length / 1024).toFixed(1);
    console.log(`    ├─ ${version.client}: ${size}kb`);
  }
}

async function resolveConflict(
  conflict: AssetConflict,
): Promise<"source" | "target" | "merge" | "rename" | "skip" | symbol> {
  const canMerge = conflict.type === "agents" || conflict.type === "mcp";

  const options: { value: string; label: string; hint: string }[] =
    conflict.versions.map((v) => ({
      value: v.client,
      label: `Use ${v.client} version`,
      hint: `${(v.content.length / 1024).toFixed(1)}kb`,
    }));

  if (canMerge) {
    options.push({
      value: "merge",
      label: "Merge (combine both)",
      hint: "concatenate content",
    });
  } else {
    options.push({
      value: "rename",
      label: "Keep both (rename)",
      hint: "e.g. file.md → file-cursor.md",
    });
  }

  options.push({
    value: "skip",
    label: "Skip (keep as-is)",
    hint: "no changes",
  });

  const result = await select({
    message: `How to resolve ${conflict.canonicalKey.split("::")[1]}?`,
    options,
  });

  if (typeof result === "symbol") return result;
  if (result === "merge") return "merge";
  if (result === "rename") return "rename";
  if (result === "skip") return "skip";

  conflict.selectedVersion = conflict.versions.find((v) => v.client === result);
  const isSource = result === conflict.versions[0].client;
  return isSource ? "source" : "target";
}

function buildPlanFromConflicts(
  allAssets: AssetContent[],
  conflicts: AssetConflict[],
  targetClients: string[],
  defs: ClientDefinition[],
  direction: SyncDirection,
): SyncPlanEntry[] {
  const plan: SyncPlanEntry[] = [];
  const conflictKeys = new Set(conflicts.map((c) => c.canonicalKey));

  const resolvedAssets = new Map<string, AssetContent>();

  for (const asset of allAssets) {
    const key = `${asset.type}::${asset.canonicalPath ?? asset.relativePath}`;
    if (conflictKeys.has(key)) continue;
    if (!resolvedAssets.has(key)) {
      resolvedAssets.set(key, asset);
    }
  }

  for (const conflict of conflicts) {
    if (conflict.resolution === "skip") continue;
    if (conflict.resolution === "merge") {
      const merged = conflict.versions
        .map((v) => v.content)
        .join("\n\n---\n\n");
      const base = conflict.versions[0];
      resolvedAssets.set(conflict.canonicalKey, {
        ...base,
        content: merged,
        hash: "merged",
      });
    } else if (conflict.resolution === "rename") {
      for (const version of conflict.versions) {
        const renamedPath = addClientSuffix(
          version.canonicalPath ?? version.relativePath,
          version.client,
        );
        const renamedKey = `${version.type}::${renamedPath}`;
        resolvedAssets.set(renamedKey, {
          ...version,
          canonicalPath: renamedPath,
          relativePath: renamedPath,
        });
      }
    } else {
      const winner =
        conflict.selectedVersion ??
        (conflict.resolution === "source"
          ? conflict.versions[0]
          : conflict.versions[1]);
      if (winner) {
        resolvedAssets.set(conflict.canonicalKey, winner);
      }
    }
  }

  for (const [key, asset] of resolvedAssets.entries()) {
    for (const clientName of targetClients) {
      if (clientName === asset.client) continue;

      const def = defs.find((d) => d.name === clientName);
      if (!def) continue;

      const supportsType = def.assets.some((a) => a.type === asset.type);
      if (!supportsType) continue;

      const targetPath = `${def.root}/${asset.canonicalPath ?? asset.relativePath}`;

      plan.push({
        asset,
        targetClient: clientName as any,
        targetPath,
        targetRelativePath: asset.canonicalPath ?? asset.relativePath,
        action: "create",
      });
    }
  }

  return plan;
}

function addClientSuffix(filePath: string, client: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) {
    return `${filePath}-${client}`;
  }
  const name = filePath.slice(0, lastDot);
  const ext = filePath.slice(lastDot);
  return `${name}-${client}${ext}`;
}
