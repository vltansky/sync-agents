#!/usr/bin/env node
import process from 'node:process';
import chalk from 'chalk';
import { parseCliArgs } from './cli/options.js';
import { interactiveReview } from './cli/interactive.js';
import { buildClientDefinitions } from './clients/definitions.js';
import { discoverAssets } from './utils/discovery.js';
import { applyPlan } from './utils/apply.js';
import { buildSyncPlan } from './utils/plan.js';
import { fileExists } from './utils/fs.js';
import type { ClientDefinition } from './types/index.js';
import { exportCursorHistory } from './utils/cursorHistory.js';

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
  const available = await filterAvailable(defs);
  const missing = defs.filter((def) => !available.some((d) => d.name === def.name));

  if (missing.length && options.verbose) {
    console.log(chalk.gray(`Skipping clients without directories: ${missing.map((m) => m.name).join(', ')}`));
  }

  const assets = await discoverAssets(available, {
    types: options.types,
    clients: options.clients,
  });

  if (assets.length === 0) {
    console.log(chalk.yellow('No agent assets found. Add AGENTS/commands/rules to sync.'));
    return;
  }

  const { plan } = buildSyncPlan(assets, available, options);

  let shouldApply = options.mode !== 'interactive';
  if (options.mode === 'interactive') {
    shouldApply = await interactiveReview(plan);
  }

  if (!shouldApply) {
    return;
  }

  await applyPlan(plan, options);
}

async function filterAvailable(defs: ClientDefinition[]): Promise<ClientDefinition[]> {
  const results: ClientDefinition[] = [];
  for (const def of defs) {
    const exists = await fileExists(def.root);
    if (exists) {
      results.push(def);
    }
  }
  return results;
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
