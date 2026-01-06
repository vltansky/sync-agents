import { intro, note, outro, multiselect, confirm } from "@clack/prompts";
import chalk from "chalk";
import type { SyncPlanEntry } from "../types/index.js";

interface ReviewResult {
  proceed: boolean;
  entries: SyncPlanEntry[];
}

export async function interactiveReview(
  plan: SyncPlanEntry[],
): Promise<ReviewResult> {
  intro("sync-agents — interactive review");

  if (plan.length === 0) {
    note("Nothing to synchronize. All clients are aligned.", "Status");
    outro("Done.");
    return { proceed: false, entries: [] };
  }

  const stats = summarize(plan);
  console.log();
  console.log(chalk.bold("Planned Actions:"));
  for (const stat of stats) {
    console.log(
      `${stat.action.padEnd(8)} ${chalk.cyan(String(stat.count).padStart(3))} files (${stat.clients.join(", ") || "—"})`,
    );
  }

  console.log();
  const filtered = await chooseEntries(plan);
  if (filtered.length === 0) {
    note("No changes selected.", "Skipped");
    outro("Aborted.");
    return { proceed: false, entries: [] };
  }

  const proceed = await confirm({
    message: `Apply ${filtered.length} selected change(s)?`,
    active: "Yes",
    inactive: "No",
  });

  if (!proceed) {
    outro("Aborted by user.");
    return { proceed: false, entries: [] };
  }

  outro("Executing plan...");
  return { proceed: true, entries: filtered };
}

function summarize(plan: SyncPlanEntry[]) {
  const byAction = new Map<
    string,
    { action: string; count: number; clients: Set<string> }
  >();
  for (const item of plan) {
    const entry = byAction.get(item.action) ?? {
      action: item.action,
      count: 0,
      clients: new Set<string>(),
    };
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

async function chooseEntries(plan: SyncPlanEntry[]): Promise<SyncPlanEntry[]> {
  renderPlanTree(plan);
  const choices = plan.map((entry, index) => ({
    value: index,
    label: `${entry.action.toUpperCase()} ${entry.targetClient} :: ${entry.asset.relativePath}`,
    hint: entry.reason,
  }));

  const response = await multiselect({
    message: "Select changes to apply",
    options: choices,
    initialValues: choices.map((c) => c.value),
  });

  if (!response || !Array.isArray(response) || response.length === 0) {
    return [];
  }

  return response.map((idx) => plan[idx as number]);
}

function renderPlanTree(plan: SyncPlanEntry[]): void {
  console.log();
  console.log(chalk.bold("Updated Plan"));
  console.log(
    `└─ ${chalk.dim("Review each change and uncheck anything you don’t want to sync:")}`,
  );
  plan.forEach((entry) => {
    const label = `${entry.action.toUpperCase()} ${entry.targetClient} :: ${entry.asset.relativePath}`;
    console.log(`   ☐ ${formatAction(entry.action)} ${label}`);
  });
  console.log();
}

function formatAction(action: string): string {
  switch (action) {
    case "create":
      return chalk.green("CREATE");
    case "update":
      return chalk.blue("UPDATE");
    case "skip":
      return chalk.gray("SKIP");
    default:
      return chalk.white(action.toUpperCase());
  }
}
