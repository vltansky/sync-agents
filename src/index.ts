#!/usr/bin/env node
import process from "node:process";
import chalk from "chalk";
import { parseCliArgs } from "./cli/options.js";
import { runInteractiveFlow } from "./cli/interactive-v2.js";
import { buildClientDefinitions } from "./clients/definitions.js";
import { discoverAssets } from "./utils/discovery.js";
import { applyPlan } from "./utils/apply.js";
import { buildSyncPlan } from "./utils/plan.js";
import { fileExists } from "./utils/fs.js";
import type { ClientDefinition } from "./types/index.js";
import { exportCursorHistory } from "./utils/cursorHistory.js";

async function main() {
  const options = parseCliArgs(process.argv);

  if (options.exportCursorHistory) {
    await exportCursorHistory({
      destination: options.cursorHistoryDest,
      verbose: options.verbose,
    });
  }

  const projectRoot = process.cwd();
  const defs = buildClientDefinitions(projectRoot);

  if (options.mode === "interactive") {
    const result = await runInteractiveFlow(defs, options);
    if (!result.proceed) {
      return;
    }
    // Use symlinks from interactive prompt if not already set via --link
    const applyOptions = {
      ...options,
      link: options.link || result.useSymlinks,
    };
    await applyPlan(result.entries, applyOptions);
    return;
  }

  const { available, missing } = await filterAvailable(
    defs,
    options.clients,
    options.source,
  );

  if (missing.length && options.verbose) {
    console.log(
      chalk.gray(
        `Skipping clients without directories: ${missing.map((m) => m.name).join(", ")}`,
      ),
    );
  }

  const assets = await discoverAssets(available, {
    types: options.types,
    clients: options.clients,
  });

  if (assets.length === 0) {
    console.log(
      chalk.yellow("No agent assets found. Add AGENTS/commands/rules to sync."),
    );
    return;
  }

  const { plan } = buildSyncPlan(assets, available, options);
  await applyPlan(plan, options);
}

function resolveClientsToCheck(
  defs: ClientDefinition[],
  selectedClients?: string[],
  source?: string,
): ClientDefinition[] {
  const names = new Set<string>();
  if (selectedClients && selectedClients.length > 0) {
    selectedClients.forEach((name) => names.add(name));
  }
  if (source) {
    names.add(source);
  }
  if (names.size === 0) {
    return defs;
  }
  return defs.filter((def) => names.has(def.name));
}

async function filterAvailable(
  defs: ClientDefinition[],
  selectedClients?: string[],
  source?: string,
): Promise<{ available: ClientDefinition[]; missing: ClientDefinition[] }> {
  const candidates = resolveClientsToCheck(defs, selectedClients, source);
  const results: ClientDefinition[] = [];
  const missing: ClientDefinition[] = [];
  for (const def of candidates) {
    const exists = await fileExists(def.root);
    if (exists) {
      results.push(def);
    } else {
      missing.push(def);
    }
  }
  return { available: results, missing };
}

main().catch((error) => {
  console.error(
    chalk.red(error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
});
