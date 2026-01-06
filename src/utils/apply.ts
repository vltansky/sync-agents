import chalk from 'chalk';
import type { SyncOptions, SyncPlanEntry } from '../types/index.js';
import { writeFileSafe } from './fs.js';

export async function applyPlan(plan: SyncPlanEntry[], options: SyncOptions): Promise<void> {
  if (plan.length === 0) {
    if (options.verbose) {
      console.log(chalk.green('No changes required.'));
    }
    return;
  }

  for (const entry of plan) {
    if (entry.action === 'skip') {
      if (options.verbose) {
        console.log(chalk.gray(`skip   ${entry.targetClient} :: ${entry.asset.relativePath}`));
      }
      continue;
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow(`${entry.action.padEnd(7)} ${entry.targetClient} :: ${entry.asset.relativePath}`)
      );
      continue;
    }

    await writeFileSafe(entry.targetPath, entry.asset.content);
    console.log(chalk.green(`${entry.action.padEnd(7)} ${entry.targetClient} :: ${entry.asset.relativePath}`));
  }
}
