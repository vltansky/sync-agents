import {
  intro,
  outro,
  select,
  multiselect,
  groupMultiselect,
  confirm,
  spinner,
  note,
} from "@clack/prompts";
import chalk from "chalk";
import type {
  AgentClientName,
  AssetContent,
  AssetConflict,
  AssetType,
  ClientDefinition,
  ScanResult,
  SyncDirection,
  SyncOptions,
  SyncPlanEntry,
  SyncScope,
} from "../types/index.js";
import { discoverAssets } from "../utils/discovery.js";
import {
  fileExists,
  commandExists,
  readFileSafe,
  hashContent,
} from "../utils/fs.js";
import {
  mergeMcpAssets,
  parseMcpConfig,
  detectMcpFormat,
  serializeMcpConfig,
  formatEnvForDisplay,
  compareServerConfigs,
  validateMcpConfig,
  getMcpCommands,
  findRemovedServers,
  type McpConfig,
  type McpFormat,
  type McpServerConfig,
} from "../utils/mcp.js";
import {
  calculateSimilarity,
  getSimilarityLabel,
  formatRelativeTime,
} from "../utils/similarity.js";

/** Format asset count with type breakdown for display */
function formatAssetSummary(assets: AssetContent[]): string {
  if (assets.length === 0) return "empty";

  const byType: Partial<Record<AssetType, number>> = {};
  for (const a of assets) {
    byType[a.type] = (byType[a.type] || 0) + 1;
  }

  const typeLabels: Record<AssetType, string> = {
    agents: "agent",
    commands: "cmd",
    rules: "rule",
    skills: "skill",
    mcp: "mcp",
    prompts: "prompt",
  };

  const parts: string[] = [];
  for (const [type, count] of Object.entries(byType)) {
    const label = typeLabels[type as AssetType] || type;
    parts.push(`${count} ${label}${count > 1 ? "s" : ""}`);
  }

  // If too many parts, show total with top 2 types
  if (parts.length > 3) {
    const total = assets.length;
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([type, count]) => {
        const label = typeLabels[type as AssetType] || type;
        return `${count} ${label}${count > 1 ? "s" : ""}`;
      });
    return `${total} files: ${topTypes.join(", ")}...`;
  }

  return parts.join(", ");
}

export interface InteractiveResult {
  proceed: boolean;
  entries: SyncPlanEntry[];
  scope: SyncScope;
  direction: SyncDirection;
  useSymlinks?: boolean;
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

  // Select direction FIRST (before scanning shows diff info)
  const direction: SyncDirection | symbol =
    options.direction && options.direction !== "sync"
      ? options.direction
      : await selectDirection(scope);
  if (typeof direction === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: "sync" };
  }
  const resolvedDirection: SyncDirection = direction;

  const s = spinner();
  s.start("Scanning for assets...");

  const scanResults = await scanAllClients(defs, scope);
  s.stop("Scan complete.");

  const projectAssets =
    scope === "global"
      ? []
      : scanResults.find((r) => r.client === "project")?.assets ?? [];
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

  // Detect conflicts based on direction and scope
  // Push: project is authoritative, only detect conflicts between global clients
  // Pull: project is target, detect conflicts between global clients
  // Sync: detect conflicts between all (but only globalAssets if scope is global)
  const assetsForConflictDetection =
    resolvedDirection === "push"
      ? globalAssets
      : resolvedDirection === "pull"
        ? globalAssets
        : scope === "global"
          ? globalAssets
          : allAssets;

  const conflicts = detectConflicts(assetsForConflictDetection);

  if (conflicts.length > 0) {
    console.log();
    console.log(chalk.bold.yellow(`Found ${conflicts.length} conflict(s):`));

    for (const conflict of conflicts) {
      const resolution = await resolveConflict(conflict);
      if (typeof resolution === "symbol") {
        outro("Cancelled.");
        return { proceed: false, entries: [], scope, direction: "sync" };
      }
      conflict.resolution = resolution;
    }
  }

  // Now select target clients with diff info
  const targetClients = await selectTargetClients(
    scanResults,
    scope,
    resolvedDirection,
    allAssets,
    conflicts,
    defs,
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

  // Review all assets in a unified flow
  const reviewedPlan = await reviewAllAssets(plan);
  if (typeof reviewedPlan === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  if (reviewedPlan.length === 0) {
    note("All changes filtered out.", "Nothing to do");
    outro("Nothing to apply.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  console.log();
  console.log(chalk.bold("Planned changes:"));
  for (const entry of reviewedPlan) {
    const icon = entry.action === "create" ? chalk.green("+") : chalk.blue("~");
    console.log(
      `  ${icon} ${entry.targetClient} :: ${entry.targetRelativePath ?? entry.asset.relativePath}`,
    );
  }
  console.log();

  const confirmed = await confirm({
    message: `Apply ${reviewedPlan.length} change(s)?`,
    active: "Yes",
    inactive: "No",
  });

  if (!confirmed || typeof confirmed === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  // Ask about symlinks (default: no)
  const useSymlinks = await confirm({
    message:
      "Use symlinks instead of copying? (keeps files in sync automatically)",
    active: "Yes",
    inactive: "No",
    initialValue: false,
  });

  if (typeof useSymlinks === "symbol") {
    outro("Cancelled.");
    return { proceed: false, entries: [], scope, direction: resolvedDirection };
  }

  outro("Applying changes...");
  return {
    proceed: true,
    entries: reviewedPlan,
    scope,
    direction: resolvedDirection,
    useSymlinks: useSymlinks === true,
  };
}

async function selectScope(): Promise<SyncScope | symbol> {
  const result = await select({
    message: "What would you like to sync?",
    options: [
      {
        value: "global",
        label: "Global configs",
        hint: "~/.cursor, ~/.claude, ~/.codex, etc.",
      },
      {
        value: "project",
        label: "Project files",
        hint: "./AGENTS.md, ./rules/*, etc.",
      },
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
  allAssets: AssetContent[],
  conflicts: AssetConflict[],
  defs: ClientDefinition[],
): Promise<string[] | symbol> {
  // For sync mode, filter based on scope
  // For push/pull, direction determines which clients are targets
  const availableClients = scanResults.filter((r) => {
    if (scope === "global") return r.client !== "project";
    // For project scope or all, show all clients
    return true;
  });

  // Calculate diff for each client
  function getDiffLabel(client: ScanResult): string {
    if (!client.found) {
      // New client - everything would be added
      const sourceAssets = allAssets.filter((a) => a.client !== client.client);
      const uniqueCanonicals = new Set(
        sourceAssets.map((a) => a.canonicalPath),
      );
      return `new, will get +${uniqueCanonicals.size}`;
    }

    // Calculate what would be created/updated for this client
    const plan = buildPlanFromConflicts(
      allAssets,
      conflicts,
      [client.client],
      defs,
      direction,
    );

    const creates = plan.filter((p) => p.action === "create").length;
    const updates = plan.filter((p) => p.action === "update").length;

    if (creates === 0 && updates === 0) {
      return `${client.assets.length} files, no changes`;
    }

    const parts: string[] = [];
    if (creates > 0) parts.push(chalk.green(`+${creates}`));
    if (updates > 0) parts.push(chalk.blue(`~${updates}`));
    return `${client.assets.length} files, ${parts.join(" ")}`;
  }

  if (direction === "push") {
    const globalClients = scanResults.filter((r) => r.client !== "project");
    const result = await multiselect({
      message: "Sync to which clients?",
      options: globalClients.map((r) => ({
        value: r.client,
        label: `${r.displayName} (${getDiffLabel(r)})`,
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
      label: `${r.displayName} (${getDiffLabel(r)})`,
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
    // Always scan all clients to get full picture for diffing
    // Scope filtering happens in client selection, not scanning

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
      // Sort by modification time, newest first
      const sorted = versions.slice().sort((a, b) => {
        const timeA = a.modifiedAt?.getTime() ?? 0;
        const timeB = b.modifiedAt?.getTime() ?? 0;
        return timeB - timeA;
      });
      conflicts.push({
        canonicalKey: key,
        type: versions[0].type,
        versions: sorted,
      });
    }
  }

  return conflicts;
}

async function resolveConflict(
  conflict: AssetConflict,
): Promise<"source" | "target" | "merge" | "rename" | "skip" | symbol> {
  const canMerge = conflict.type === "agents" || conflict.type === "mcp";
  const [, filePath] = conflict.canonicalKey.split("::");

  // Calculate similarity between first two versions
  const similarity =
    conflict.versions.length >= 2
      ? calculateSimilarity(
          conflict.versions[0].content,
          conflict.versions[1].content,
        )
      : 1;
  const similarityLabel = getSimilarityLabel(similarity);
  const similarityPct = Math.round(similarity * 100);

  const options: { value: string; label: string; hint?: string }[] =
    conflict.versions.map((v) => {
      const clientLabel = v.client === "project" ? "local (./)" : v.client;
      return {
        value: v.client,
        label: `Use ${clientLabel} (${(v.content.length / 1024).toFixed(1)}kb, ${formatRelativeTime(v.modifiedAt)})`,
      };
    });

  if (canMerge) {
    options.push({
      value: "merge",
      label: "Merge (combine both)",
    });
  } else {
    options.push({
      value: "rename",
      label: "Keep both (rename)",
    });
  }

  options.push({
    value: "skip",
    label: "Skip (keep as-is)",
  });

  const result = await select({
    message: `${filePath} - ${similarityPct}% ${similarityLabel}`,
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

  // Build index of what each client already has (by canonical path and hash)
  const clientAssets = new Map<string, Map<string, string>>(); // client -> (canonicalPath -> hash)
  for (const asset of allAssets) {
    const canonical = asset.canonicalPath ?? asset.relativePath;
    if (!clientAssets.has(asset.client)) {
      clientAssets.set(asset.client, new Map());
    }
    clientAssets.get(asset.client)!.set(canonical, asset.hash);
  }

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
      let merged: string;
      if (conflict.type === "mcp") {
        // Use smart MCP merging
        const mcpMerged = mergeMcpAssets(conflict.versions);
        merged =
          mcpMerged ??
          conflict.versions.map((v) => v.content).join("\n\n---\n\n");
      } else {
        // Simple text concatenation for agents files
        merged = conflict.versions.map((v) => v.content).join("\n\n---\n\n");
      }
      const base = conflict.versions[0];
      resolvedAssets.set(conflict.canonicalKey, {
        ...base,
        content: merged,
        hash: hashContent(merged),
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

      // Apply direction filtering
      if (direction === "push" && asset.client !== "project") {
        // In push mode, only sync FROM project to global clients
        continue;
      }
      if (direction === "pull" && clientName !== "project") {
        // In pull mode, only sync TO project
        continue;
      }

      const def = defs.find((d) => d.name === clientName);
      if (!def) continue;

      const supportsType = def.assets.some((a) => a.type === asset.type);
      if (!supportsType) continue;

      const canonical = asset.canonicalPath ?? asset.relativePath;

      // Check if target already has this file with same content
      const targetAssets = clientAssets.get(clientName);
      if (targetAssets) {
        const existingHash = targetAssets.get(canonical);
        if (existingHash === asset.hash) {
          // Target already has identical content, skip
          continue;
        }
      }

      const targetPath = `${def.root}/${canonical}`;

      plan.push({
        asset,
        targetClient: clientName as AgentClientName,
        targetPath,
        targetRelativePath: canonical,
        action: targetAssets?.has(canonical) ? "update" : "create",
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

/**
 * Server version from a specific client
 */
interface ServerVersion {
  client: string;
  config: McpServerConfig;
  entry: SyncPlanEntry;
  format: McpFormat;
  fullConfig: McpConfig;
}

/**
 * Asset version from a specific client (for commands/agents)
 */
interface AssetVersion {
  client: string;
  asset: AssetContent;
  entry: SyncPlanEntry;
}

/**
 * Resolved asset ready for selection
 */
interface ResolvedAsset {
  name: string;
  type: AssetType;
  version: AssetVersion;
  label: string;
}

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  mcp: "MCP Servers",
  commands: "Commands",
  agents: "Agents",
  rules: "Rules",
  skills: "Skills",
  prompts: "Prompts",
};

/**
 * Unified review flow for all asset types
 * 1. Resolve conflicts (ask user to pick version when same asset differs)
 * 2. Show single grouped multiselect for all assets
 */
async function reviewAllAssets(
  plan: SyncPlanEntry[],
): Promise<SyncPlanEntry[] | symbol> {
  if (plan.length === 0) return plan;

  // Separate MCP from other assets (MCP needs special handling)
  const mcpEntries = plan.filter((e) => e.asset.type === "mcp");
  const otherEntries = plan.filter((e) => e.asset.type !== "mcp");

  // Step 1: Process MCP servers
  const mcpResult = await resolveMcpConflicts(mcpEntries);
  if (typeof mcpResult === "symbol") return mcpResult;

  // Step 2: Process other assets and resolve conflicts
  const otherResult = await resolveAssetConflicts(otherEntries);
  if (typeof otherResult === "symbol") return otherResult;

  const allResolved = [...mcpResult.resolved, ...otherResult.resolved];
  const mcpServerChoices = mcpResult.serverChoices;

  // If nothing to select, return early
  if (allResolved.length === 0) {
    return [];
  }

  // If only one asset total and no conflicts were resolved, skip selection
  if (
    allResolved.length === 1 &&
    !mcpResult.hadConflicts &&
    !otherResult.hadConflicts
  ) {
    return buildFinalPlan(
      allResolved,
      mcpServerChoices,
      mcpEntries,
      otherEntries,
    );
  }

  // Step 3: Show grouped multiselect for all assets
  const groupedOptions: Record<
    string,
    { value: string; label: string; hint?: string }[]
  > = {};

  for (const resolved of allResolved) {
    const groupKey = ASSET_TYPE_LABELS[resolved.type];
    if (!groupedOptions[groupKey]) {
      groupedOptions[groupKey] = [];
    }
    groupedOptions[groupKey].push({
      value: `${resolved.type}::${resolved.name}`,
      label: resolved.name,
      hint: resolved.label,
    });
  }

  // Sort options within each group
  for (const group of Object.values(groupedOptions)) {
    group.sort((a, b) => a.label.localeCompare(b.label));
  }

  console.log();
  const selected = await groupMultiselect({
    message: "Select assets to sync:",
    options: groupedOptions,
    initialValues: allResolved.map((r) => `${r.type}::${r.name}`),
  });

  if (typeof selected === "symbol") return selected;

  const selectedSet = new Set(selected as string[]);

  // Filter resolved assets to only selected ones
  const selectedResolved = allResolved.filter((r) =>
    selectedSet.has(`${r.type}::${r.name}`),
  );

  if (selectedResolved.length === 0) {
    return [];
  }

  return buildFinalPlan(
    selectedResolved,
    mcpServerChoices,
    mcpEntries,
    otherEntries,
  );
}

/**
 * Resolve MCP server conflicts and prepare for selection
 */
async function resolveMcpConflicts(
  mcpEntries: SyncPlanEntry[],
): Promise<
  | {
      resolved: ResolvedAsset[];
      serverChoices: Map<string, ServerVersion>;
      hadConflicts: boolean;
    }
  | symbol
> {
  const resolved: ResolvedAsset[] = [];
  const serverChoices = new Map<string, ServerVersion>();
  let hadConflicts = false;

  if (mcpEntries.length === 0) {
    return { resolved, serverChoices, hadConflicts };
  }

  // Collect servers by name
  const serverVersions = new Map<string, ServerVersion[]>();
  const seenServerClient = new Set<string>();

  for (const entry of mcpEntries) {
    const format = detectMcpFormat(entry.asset.path);
    const config = parseMcpConfig(entry.asset.content, format);
    if (!config?.mcpServers) continue;

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers,
    )) {
      const key = `${serverName}::${entry.asset.client}`;
      if (seenServerClient.has(key)) continue;
      seenServerClient.add(key);

      const versions = serverVersions.get(serverName) ?? [];
      versions.push({
        client: entry.asset.client,
        config: serverConfig,
        entry,
        format,
        fullConfig: config,
      });
      serverVersions.set(serverName, versions);
    }
  }

  // Process each server
  for (const [serverName, versions] of serverVersions.entries()) {
    if (versions.length === 1) {
      const version = versions[0];
      const envDisplay = formatEnvForDisplay(version.config.env);
      serverChoices.set(serverName, version);
      resolved.push({
        name: serverName,
        type: "mcp",
        version: {
          client: version.client,
          asset: version.entry.asset,
          entry: version.entry,
        },
        label: `${version.client} - ${envDisplay}`,
      });
    } else {
      // Check if versions differ
      const first = versions[0];
      let hasDifferences = false;

      for (let i = 1; i < versions.length; i++) {
        const comparison = compareServerConfigs(
          first.config,
          versions[i].config,
        );
        if (!comparison.same) {
          hasDifferences = true;
          break;
        }
      }

      if (!hasDifferences) {
        const envDisplay = formatEnvForDisplay(first.config.env);
        serverChoices.set(serverName, first);
        resolved.push({
          name: serverName,
          type: "mcp",
          version: {
            client: first.client,
            asset: first.entry.asset,
            entry: first.entry,
          },
          label: `${versions.map((v) => v.client).join(", ")} - ${envDisplay}`,
        });
      } else {
        hadConflicts = true;
        // Show conflict and ask user
        console.log();
        console.log(
          chalk.yellow(`MCP server "${serverName}" differs across clients:`),
        );
        for (const version of versions) {
          const envDisplay = formatEnvForDisplay(version.config.env);
          console.log(
            `  ${chalk.gray(version.client)}: ${version.config.command ?? "?"} - ${chalk.dim(envDisplay)}`,
          );
        }

        const versionChoice = await select({
          message: `Which "${serverName}" config to use?`,
          options: [
            ...versions.map((v) => ({
              value: v.client,
              label: `${v.client} (${v.config.command ?? "?"})`,
              hint: formatEnvForDisplay(v.config.env),
            })),
            { value: "__skip__", label: "Skip this server" },
          ],
        });

        if (typeof versionChoice === "symbol") return versionChoice;

        if (versionChoice !== "__skip__") {
          const selected = versions.find((v) => v.client === versionChoice);
          if (selected) {
            const envDisplay = formatEnvForDisplay(selected.config.env);
            serverChoices.set(serverName, selected);
            resolved.push({
              name: serverName,
              type: "mcp",
              version: {
                client: selected.client,
                asset: selected.entry.asset,
                entry: selected.entry,
              },
              label: `${selected.client} - ${envDisplay}`,
            });
          }
        }
      }
    }
  }

  return { resolved, serverChoices, hadConflicts };
}

/**
 * Resolve conflicts for non-MCP assets
 */
async function resolveAssetConflicts(
  entries: SyncPlanEntry[],
): Promise<{ resolved: ResolvedAsset[]; hadConflicts: boolean } | symbol> {
  const resolved: ResolvedAsset[] = [];
  let hadConflicts = false;

  if (entries.length === 0) {
    return { resolved, hadConflicts };
  }

  // Group by type and name
  const assetVersions = new Map<string, AssetVersion[]>();
  const seenAssetClient = new Set<string>();

  for (const entry of entries) {
    const assetName = entry.asset.name;
    const key = `${entry.asset.type}::${assetName}::${entry.asset.client}`;
    if (seenAssetClient.has(key)) continue;
    seenAssetClient.add(key);

    const mapKey = `${entry.asset.type}::${assetName}`;
    const versions = assetVersions.get(mapKey) ?? [];
    versions.push({
      client: entry.asset.client,
      asset: entry.asset,
      entry,
    });
    assetVersions.set(mapKey, versions);
  }

  // Process each asset
  for (const [mapKey, versions] of assetVersions.entries()) {
    const [assetType, ...nameParts] = mapKey.split("::");
    const assetName = nameParts.join("::");
    const type = assetType as AssetType;

    if (versions.length === 1) {
      const version = versions[0];
      const sizeKb = (version.asset.content.length / 1024).toFixed(1);
      resolved.push({
        name: assetName,
        type,
        version,
        label: `${version.client} (${sizeKb}kb)`,
      });
    } else {
      // Check if versions differ
      const first = versions[0];
      let hasDifferences = false;

      for (let i = 1; i < versions.length; i++) {
        if (versions[i].asset.hash !== first.asset.hash) {
          hasDifferences = true;
          break;
        }
      }

      if (!hasDifferences) {
        const sizeKb = (first.asset.content.length / 1024).toFixed(1);
        resolved.push({
          name: assetName,
          type,
          version: first,
          label: `${versions.map((v) => v.client).join(", ")} (${sizeKb}kb)`,
        });
      } else {
        hadConflicts = true;
        // Show conflict
        console.log();
        console.log(
          chalk.yellow(`"${assetName}" (${type}) differs across clients:`),
        );
        for (const version of versions) {
          const sizeKb = (version.asset.content.length / 1024).toFixed(1);
          const relTime = formatRelativeTime(version.asset.modifiedAt);
          console.log(
            `  ${chalk.gray(version.client)}: ${sizeKb}kb, ${relTime}`,
          );
        }

        const similarity = calculateSimilarity(
          first.asset.content,
          versions[1].asset.content,
        );
        console.log(
          chalk.dim(
            `  Similarity: ${Math.round(similarity * 100)}% ${getSimilarityLabel(similarity)}`,
          ),
        );

        const versionChoice = await select({
          message: `Which "${assetName}" to use?`,
          options: [
            ...versions.map((v) => ({
              value: v.client,
              label: `${v.client} (${(v.asset.content.length / 1024).toFixed(1)}kb)`,
              hint: formatRelativeTime(v.asset.modifiedAt),
            })),
            { value: "__skip__", label: "Skip" },
          ],
        });

        if (typeof versionChoice === "symbol") return versionChoice;

        if (versionChoice !== "__skip__") {
          const selected = versions.find((v) => v.client === versionChoice);
          if (selected) {
            const sizeKb = (selected.asset.content.length / 1024).toFixed(1);
            resolved.push({
              name: assetName,
              type,
              version: selected,
              label: `${selected.client} (${sizeKb}kb)`,
            });
          }
        }
      }
    }
  }

  return { resolved, hadConflicts };
}

/**
 * Build final plan from selected assets
 */
function buildFinalPlan(
  selectedResolved: ResolvedAsset[],
  mcpServerChoices: Map<string, ServerVersion>,
  mcpEntries: SyncPlanEntry[],
  otherEntries: SyncPlanEntry[],
): SyncPlanEntry[] {
  const finalPlan: SyncPlanEntry[] = [];

  // Handle MCP entries specially - need to rebuild config with selected servers
  const selectedMcpServers = new Set(
    selectedResolved.filter((r) => r.type === "mcp").map((r) => r.name),
  );

  if (selectedMcpServers.size > 0) {
    // Group MCP entries by target client
    const mcpByTarget = new Map<string, SyncPlanEntry[]>();
    for (const entry of mcpEntries) {
      const entries = mcpByTarget.get(entry.targetClient) ?? [];
      entries.push(entry);
      mcpByTarget.set(entry.targetClient, entries);
    }

    for (const [targetClient, entries] of mcpByTarget.entries()) {
      const mergedServers: Record<string, McpServerConfig> = {};

      for (const serverName of selectedMcpServers) {
        const choice = mcpServerChoices.get(serverName);
        if (choice) {
          mergedServers[serverName] = choice.config;
        }
      }

      if (Object.keys(mergedServers).length === 0) continue;

      const firstEntry = entries[0];
      const format = detectMcpFormat(firstEntry.asset.path);
      const baseConfig = parseMcpConfig(firstEntry.asset.content, format) ?? {};
      const finalConfig: McpConfig = {
        ...baseConfig,
        mcpServers: mergedServers,
      };
      const serializedContent = serializeMcpConfig(finalConfig, format);

      finalPlan.push({
        ...firstEntry,
        asset: {
          ...firstEntry.asset,
          content: serializedContent,
          hash: hashContent(serializedContent),
        },
      });
    }
  }

  // Handle other entries
  const selectedOther = new Map<string, ResolvedAsset>();
  for (const r of selectedResolved) {
    if (r.type !== "mcp") {
      selectedOther.set(`${r.type}::${r.name}`, r);
    }
  }

  const processedTargets = new Set<string>();
  for (const entry of otherEntries) {
    const key = `${entry.asset.type}::${entry.asset.name}`;
    const resolved = selectedOther.get(key);
    if (!resolved) continue;

    const targetKey = `${key}::${entry.targetClient}`;
    if (processedTargets.has(targetKey)) continue;
    processedTargets.add(targetKey);

    // Use resolved version's content
    if (entry.asset.client === resolved.version.client) {
      finalPlan.push(entry);
    } else {
      finalPlan.push({
        ...entry,
        asset: resolved.version.asset,
      });
    }
  }

  return finalPlan;
}

/**
 * Validate MCP configs and warn about potential issues
 */
async function validateAndWarnMcp(
  newEntries: SyncPlanEntry[],
  originalEntries: SyncPlanEntry[],
): Promise<void> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingCommands = new Set<string>();

  // Validate each new MCP config
  for (const entry of newEntries) {
    const format = detectMcpFormat(entry.asset.path);
    const validation = validateMcpConfig(entry.asset.content, format);

    for (const err of validation.errors) {
      errors.push(`${entry.targetClient}: ${err}`);
    }
    for (const warn of validation.warnings) {
      warnings.push(`${entry.targetClient}: ${warn}`);
    }

    // Check if commands exist
    const config = parseMcpConfig(entry.asset.content, format);
    if (config) {
      const commands = getMcpCommands(config);
      for (const cmd of commands) {
        const exists = await commandExists(cmd);
        if (!exists) {
          missingCommands.add(cmd);
        }
      }
    }
  }

  // Check for servers being removed from targets
  for (const newEntry of newEntries) {
    const format = detectMcpFormat(newEntry.asset.path);
    const newConfig = parseMcpConfig(newEntry.asset.content, format);
    if (!newConfig) continue;

    // Find original config for same target client
    for (const origEntry of originalEntries) {
      if (origEntry.targetClient !== newEntry.targetClient) continue;

      // Read existing file at target to check what would be removed
      const existingContent = await readFileSafe(newEntry.targetPath);
      if (!existingContent) continue;

      // Use target file's format, not source
      const targetFormat = detectMcpFormat(newEntry.targetPath);
      const existingConfig = parseMcpConfig(existingContent, targetFormat);
      if (!existingConfig) continue;

      const removed = findRemovedServers(newConfig, existingConfig);
      for (const serverName of removed) {
        warnings.push(
          `${newEntry.targetClient}: server "${serverName}" will be removed`,
        );
      }
    }
  }

  // Display warnings
  if (missingCommands.size > 0) {
    console.log();
    console.log(
      chalk.yellow(
        `Warning: Commands not found in PATH: ${Array.from(missingCommands).join(", ")}`,
      ),
    );
    console.log(chalk.dim("  These MCP servers may not work correctly."));
  }

  if (warnings.length > 0) {
    console.log();
    console.log(chalk.yellow("Warnings:"));
    for (const warn of warnings) {
      console.log(chalk.yellow(`  - ${warn}`));
    }
  }

  if (errors.length > 0) {
    console.log();
    console.log(chalk.red("Errors:"));
    for (const err of errors) {
      console.log(chalk.red(`  - ${err}`));
    }
  }
}
