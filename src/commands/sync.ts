import { select } from "@clack/prompts";
import chalk from "chalk";
import fs from "node:fs/promises";
import { buildClientDefinitions } from "../clients/definitions.js";
import type {
  AssetContent,
  SyncCommandOptions,
  SyncPlanEntry,
} from "../types/index.js";
import { applyPlan } from "../utils/apply.js";
import {
  buildBootstrapEntry,
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
import { fileExists } from "../utils/fs.js";
import { getBootstrapResolution } from "../utils/bootstrap.js";
import { createSnapshot, restoreSnapshot } from "../utils/snapshots.js";
import { printApplyResultLike } from "../utils/syncRuntime.js";

export async function runSyncCommand(
  options: SyncCommandOptions,
): Promise<void> {
  const projectRoot = process.cwd();
  const allDefs = buildClientDefinitions(projectRoot);
  const legacyDefs = buildLegacyDefinitions(projectRoot);
  const targetDefs = await getTargetDefinitions(allDefs, options.clients);
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

  for (const [key, candidates] of legacyByKey.entries()) {
    if (canonicalByKey.has(key)) {
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
        throw new Error(`Bootstrap cancelled for ${canonicalPath}`);
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

  printWarnings(ignoredCursorRules);

  if (plan.length === 0) {
    console.log(chalk.green("Nothing to sync."));
    return;
  }

  printPlan(plan);

  if (options.dryRun) {
    return;
  }

  const snapshot = await createSnapshot(
    plan
      .filter((entry) => entry.action !== "skip")
      .map((entry) => entry.targetPath),
  );
  console.log(chalk.dim(`restore-point-created ${snapshot.id}`));

  const applyResult = await applyPlan(plan, {
    mode: "merge",
    dryRun: false,
    verbose: options.verbose,
    link: resolvedLinkMode,
    separateClaudeMd: options.separateClaudeMd,
  });

  if (applyResult.failed > 0) {
    await restoreSnapshot(snapshot.id);
    throw new Error(`sync failed; restored snapshot ${snapshot.id}`);
  }

  await writeCanonicalState(await collectGeneratedStateEntries(fanoutPlan));
  printApplyResultLike(applyResult, options.verbose);
}

async function chooseBootstrapCandidate(
  canonicalPath: string,
  candidates: AssetContent[],
): Promise<AssetContent | null> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error(
      `Ambiguous bootstrap for ${canonicalPath}. Re-run interactively or pass --bootstrap-source <client>.`,
    );
  }

  const choice = await select({
    message: `Select bootstrap source for ${canonicalPath}`,
    options: [
      ...getBootstrapChoices(candidates),
      { value: "__cancel__", label: "Cancel", hint: "Abort bootstrap" },
    ],
  });

  if (typeof choice === "symbol" || choice === "__cancel__") {
    return null;
  }

  return candidates.find((asset) => asset.client === choice) ?? null;
}

async function resolveWriteMode(options: SyncCommandOptions): Promise<boolean> {
  if (options.link) return true;
  if (options.copy) return false;
  if (!process.stdout.isTTY || !process.stdin.isTTY) return false;

  const mode = await select({
    message: "How should files be written?",
    options: [
      {
        value: "symlink",
        label: "Symlink",
        hint: "Recommended when exact bytes can be reused",
      },
      {
        value: "copy",
        label: "Copy",
        hint: "Always write independent files",
      },
    ],
    initialValue: "symlink",
  });

  return mode === "symlink";
}

function printWarnings(ignoredCursorRules: AssetContent[]): void {
  if (ignoredCursorRules.length === 0) {
    return;
  }

  console.log(chalk.yellow("warn unsupported legacy inputs:"));
  for (const asset of ignoredCursorRules) {
    console.log(
      chalk.yellow(
        `  ${asset.path} :: ignored cursor rule; manage via .agents/AGENTS.md instead`,
      ),
    );
  }
  console.log();
}

function printPlan(plan: SyncPlanEntry[]): void {
  for (const entry of plan) {
    const phase = entry.reason === "bootstrap" ? "bootstrap" : "fanout";
    console.log(`${phase.padEnd(10)} ${entry.targetPath}`);
  }
  console.log();
}

async function collectGeneratedStateEntries(
  plan: SyncPlanEntry[],
): Promise<GeneratedStateEntry[]> {
  const generated: GeneratedStateEntry[] = [];

  for (const entry of plan) {
    const stats = await fs.lstat(entry.targetPath);
    generated.push({
      path: entry.targetPath,
      sourcePath: entry.asset.path,
      canonicalPath: entry.asset.canonicalPath ?? entry.asset.relativePath,
      targetClient: entry.targetClient,
      type: entry.asset.type as GeneratedStateEntry["type"],
      mode: stats.isSymbolicLink() ? "symlink" : "copy",
    });
  }

  return generated;
}

async function getTargetDefinitions(
  defs: ReturnType<typeof buildClientDefinitions>,
  selectedClients?: SyncCommandOptions["clients"],
) {
  const targets = [];

  for (const def of defs) {
    if (selectedClients && !selectedClients.includes(def.name)) {
      continue;
    }

    if (def.name === "project" || selectedClients?.includes(def.name)) {
      targets.push(def);
      continue;
    }

    if (await fileExists(def.root)) {
      targets.push(def);
    }
  }

  return targets;
}
