import { confirm, intro, note, outro } from '@clack/prompts';
import chalk from 'chalk';
import type { SyncPlanEntry } from '../types/index.js';

export async function interactiveReview(plan: SyncPlanEntry[]): Promise<boolean> {
  intro('sync-agents — interactive review');

  if (plan.length === 0) {
    note('Nothing to synchronize. All clients are aligned.', 'Status');
    outro('Done.');
    return false;
  }

  const stats = summarize(plan);
  console.log();
  console.log(chalk.bold('Planned Actions:'));
  for (const stat of stats) {
    console.log(
      `${stat.action.padEnd(8)} ${chalk.cyan(String(stat.count).padStart(3))} files (${stat.clients.join(', ') || '—'})`
    );
  }

  console.log();
  const proceed = await confirm({
    message: 'Apply these changes?',
    active: 'Yes',
    inactive: 'No',
  });

  if (!proceed) {
    outro('Aborted by user.');
    return false;
  }

  outro('Executing plan...');
  return true;
}

function summarize(plan: SyncPlanEntry[]) {
  const byAction = new Map<string, { action: string; count: number; clients: Set<string> }>();
  for (const item of plan) {
    const entry = byAction.get(item.action) ?? { action: item.action, count: 0, clients: new Set<string>() };
    entry.count += 1;
    entry.clients.add(item.targetClient);
    byAction.set(item.action, entry);
  }
  return Array.from(byAction.values()).map((entry) => ({
    action: entry.action,
    count: entry.count,
    clients: Array.from(entry.clients),
  }));
}
