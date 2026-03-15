import * as p from "@clack/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import { buildClientDefinitions } from "../clients/definitions.js";
import type {
  AssetContent,
  ClientDefinition,
  SyncCommandOptions,
  SyncPlanEntry,
} from "../types/index.js";
import { applyPlan, type ApplyResult } from "../utils/apply.js";
import {
  buildBootstrapEntry,
  buildCanonicalDefinition,
  buildFanoutPlan,
  buildLegacyDefinitions,
  discoverCanonicalAssets,
  discoverIgnoredCursorRules,
  discoverLegacyAssets,
  getBootstrapChoices,
  groupAssetsByCanonicalKey,
  synthesizeCanonicalAsset,
} from "../utils/canonical.js";
import {
  writeCanonicalState,
  type GeneratedStateEntry,
} from "../utils/canonicalState.js";
import { fileExists, readFileSafe } from "../utils/fs.js";
import { getBootstrapResolution } from "../utils/bootstrap.js";
import { createSnapshot, restoreSnapshot } from "../utils/snapshots.js";
import {
  buildSyncPlanSummaryLines,
  buildSyncTreeLines,
  abbreviateHome,
} from "../utils/reporting.js";

export async function runSyncCommand(
  options: SyncCommandOptions,
): Promise<void> {
  p.intro("link-agents");

  const projectRoot = options.root;
  const allDefs = buildClientDefinitions(projectRoot);
  const targetDefs = await getTargetDefinitions(allDefs);
  const canonicalAssets = await discoverCanonicalAssets(
    projectRoot,
    options.types,
  );
  const legacyAssets = await discoverLegacyAssets(projectRoot, options.types);
  const ignoredCursorRules = await discoverIgnoredCursorRules(projectRoot);

  const canonicalByKey = groupAssetsByCanonicalKey(canonicalAssets);
  const legacyByKey = groupAssetsByCanonicalKey(
    legacyAssets.filter((asset) => asset.type !== "rules"),
  );

  const bootstrapEntries: SyncPlanEntry[] = [];
  const synthesizedCanonical = [...canonicalAssets];

  for (const [, candidates] of legacyByKey.entries()) {
    if (
      canonicalByKey.has(
        `${candidates[0].type}::${candidates[0].canonicalPath ?? candidates[0].relativePath}`,
      )
    ) {
      continue;
    }

    const canonicalPath =
      candidates[0].canonicalPath ?? candidates[0].relativePath;
    const resolution = getBootstrapResolution({
      canonicalPath,
      candidates,
      bootstrapSource: options.bootstrapSource,
    });

    if (resolution.status === "missing") {
      continue;
    }

    if (resolution.status === "ambiguous") {
      const selected = await chooseBootstrapCandidate(
        canonicalPath,
        resolution.candidates,
      );
      if (!selected) {
        p.cancel("Cancelled.");
        process.exit(1);
      }
      bootstrapEntries.push(buildBootstrapEntry(projectRoot, selected));
      synthesizedCanonical.push(
        synthesizeCanonicalAsset(projectRoot, selected),
      );
      continue;
    }

    bootstrapEntries.push(buildBootstrapEntry(projectRoot, resolution.asset));
    synthesizedCanonical.push(
      synthesizeCanonicalAsset(projectRoot, resolution.asset),
    );
  }

  const resolvedLinkMode = await resolveWriteMode(options);
  const syncOptions = { ...options, link: resolvedLinkMode };
  const fanoutPlan = buildFanoutPlan(
    synthesizedCanonical,
    targetDefs,
    syncOptions,
  );
  const plan = [...bootstrapEntries, ...fanoutPlan];

  // Configuration box
  const types = options.types?.length
    ? options.types.join(", ")
    : "agents, commands, skills, mcp";
  const targets =
    targetDefs.length > 0 ? targetDefs.map((d) => d.name).join(", ") : "none";

  const configLines = [
    `Mode:        ${options.dryRun ? "dry-run" : "apply"}`,
    `Write mode:  ${resolvedLinkMode ? "symlink" : "copy"}`,
    `Root:        ${abbreviateHome(path.join(projectRoot, ".agents"))}`,
    `Targets:     ${targets}`,
    `Types:       ${types}`,
    `Canonical:   ${canonicalAssets.length} assets`,
    `Imported:    ${bootstrapEntries.length} new`,
  ];
  p.note(configLines.join("\n"), "Configuration");

  // Warnings
  if (ignoredCursorRules.length > 0) {
    p.log.warn(
      `${ignoredCursorRules.length} ignored legacy cursor rule(s) -- manage via .agents/AGENTS.md`,
    );
  }

  if (plan.length === 0) {
    p.outro("Nothing to sync -- already up to date.");
    return;
  }

  // Plan box
  const planLines = buildSyncPlanSummaryLines(plan);
  p.note(planLines.join("\n"), "Plan");

  const clientRoots = buildClientRootsMap(projectRoot, targetDefs);

  if (options.dryRun) {
    const dryResult = await applyPlan(plan, {
      mode: "merge",
      dryRun: true,
      verbose: options.verbose,
      link: resolvedLinkMode,
      separateClaudeMd: options.separateClaudeMd,
    });
    printSyncTree(dryResult, clientRoots);
    p.outro(formatResultLine(dryResult, true));
    return;
  }

  // Execute with spinner
  const spin = p.spinner();

  spin.start("Creating snapshot...");
  const snapshot = await createSnapshot(
    plan
      .filter((entry) => entry.action !== "skip")
      .map((entry) => entry.targetPath),
  );
  spin.stop(`Snapshot ${snapshot.id.slice(0, 12)}...`);

  if (options.verbose) {
    // Verbose mode: let applyPlan print per-entry details directly
    p.log.step("Syncing assets...");
    const applyResult = await applyPlan(plan, {
      mode: "merge",
      dryRun: false,
      verbose: true,
      link: resolvedLinkMode,
      separateClaudeMd: options.separateClaudeMd,
    });

    if (applyResult.failed > 0) {
      await restoreSnapshot(snapshot.id);
      p.cancel(`Sync failed -- restored snapshot ${snapshot.id}`);
      process.exit(1);
    }

    await writeCanonicalState(await collectGeneratedStateEntries(fanoutPlan));
    printSyncTree(applyResult, clientRoots);
    printErrors(applyResult);
    p.outro(formatResultLine(applyResult));
  } else {
    // Non-verbose: animated spinner
    spin.start("Syncing assets...");
    const applyResult = await applyPlan(plan, {
      mode: "merge",
      dryRun: false,
      verbose: false,
      link: resolvedLinkMode,
      separateClaudeMd: options.separateClaudeMd,
    });

    if (applyResult.failed > 0) {
      spin.stop("Sync failed");
      await restoreSnapshot(snapshot.id);
      p.cancel(`Sync failed -- restored snapshot ${snapshot.id}`);
      process.exit(1);
    }

    spin.stop(formatResultLine(applyResult));
    await writeCanonicalState(await collectGeneratedStateEntries(fanoutPlan));
    printSyncTree(applyResult, clientRoots);
    printErrors(applyResult);
    p.outro("Sync complete");
  }
}

function formatResultLine(result: ApplyResult, dryRun?: boolean): string {
  const parts: string[] = [];
  if (result.applied > 0) parts.push(`${result.applied} applied`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.rolledBack) parts.push("rolled back");
  const prefix = dryRun ? "Dry run: " : "";
  return parts.length > 0
    ? `${prefix}${parts.join(", ")}`
    : `${prefix}no changes`;
}

function printErrors(result: ApplyResult): void {
  if (result.errors.length === 0) return;
  const lines = result.errors.map((e) => `  ${e}`).join("\n");
  p.log.error(`Errors:\n${lines}`);
}

async function chooseBootstrapCandidate(
  canonicalPath: string,
  candidates: AssetContent[],
): Promise<AssetContent | null> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error(
      `Multiple versions found for ${canonicalPath}. Re-run interactively or pass --bootstrap-source <client>.`,
    );
  }

  const sorted = [...candidates].sort((a, b) => {
    const ta = a.modifiedAt?.getTime() ?? 0;
    const tb = b.modifiedAt?.getTime() ?? 0;
    return tb - ta;
  });

  const choice = await p.select({
    message: `Multiple versions of ${canonicalPath} found — pick one to use as source`,
    options: [
      ...getBootstrapChoices(sorted),
      { value: "__cancel__", label: "Cancel" },
    ],
  });

  if (p.isCancel(choice) || choice === "__cancel__") {
    return null;
  }

  return candidates.find((asset) => asset.path === choice) ?? null;
}

async function resolveWriteMode(options: SyncCommandOptions): Promise<boolean> {
  if (options.link) return true;
  if (options.copy) return false;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false;

  const mode = await p.select({
    message: "How should files be written?",
    options: [
      {
        value: "symlink",
        label: "Symlink",
        hint: "Recommended -- reuses canonical bytes",
      },
      { value: "copy", label: "Copy", hint: "Writes independent files" },
    ],
    initialValue: "symlink",
  });

  if (p.isCancel(mode)) {
    p.cancel("Sync cancelled.");
    process.exit(1);
  }

  return mode === "symlink";
}

async function collectGeneratedStateEntries(
  plan: SyncPlanEntry[],
): Promise<GeneratedStateEntry[]> {
  const generated: GeneratedStateEntry[] = [];

  for (const entry of plan) {
    let mode: "symlink" | "copy" = "copy";
    try {
      const stats = await fs.lstat(entry.targetPath);
      if (stats.isSymbolicLink()) mode = "symlink";
    } catch {
      continue;
    }
    const sourceContent = await readFileSafe(entry.asset.path);
    generated.push({
      path: entry.targetPath,
      sourcePath: entry.asset.path,
      canonicalPath: entry.asset.canonicalPath ?? entry.asset.relativePath,
      targetClient: entry.targetClient,
      type: entry.asset.type as GeneratedStateEntry["type"],
      mode,
      expectedContent:
        sourceContent === entry.asset.content ? undefined : entry.asset.content,
    });
  }

  return generated;
}

async function getTargetDefinitions(
  defs: ReturnType<typeof buildClientDefinitions>,
) {
  const targets = [];

  for (const def of defs) {
    if (await fileExists(def.root)) {
      targets.push(def);
    }
  }

  return targets;
}

function buildClientRootsMap(
  projectRoot: string,
  targetDefs: ClientDefinition[],
): Map<string, string> {
  const roots = new Map<string, string>();
  roots.set("canonical", buildCanonicalDefinition(projectRoot).root);
  for (const def of targetDefs) {
    roots.set(def.name, def.root);
  }
  return roots;
}

function printSyncTree(
  result: ApplyResult,
  clientRoots: Map<string, string>,
): void {
  const lines = buildSyncTreeLines(result.entries, clientRoots);
  if (lines.length === 0) return;
  p.note(lines.join("\n"), "Sync tree");
}
