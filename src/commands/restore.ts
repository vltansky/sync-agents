import chalk from "chalk";
import {
  listSnapshots,
  readSnapshot,
  restoreSnapshot,
} from "../utils/snapshots.js";
import { formatSnapshotList } from "../utils/reporting.js";
import type { RestoreCommandOptions } from "../types/index.js";

export async function runRestoreCommand(
  options: RestoreCommandOptions,
): Promise<void> {
  if (options.list) {
    const snapshots = await listSnapshots();
    if (snapshots.length === 0) {
      console.log(chalk.yellow("No snapshots available."));
      return;
    }
    console.log(chalk.cyan(`Snapshots (${snapshots.length})`));
    for (const line of formatSnapshotList(snapshots)) {
      console.log(`  ${line}`);
    }
    return;
  }

  const snapshotId = options.id ?? (await getLatestSnapshotId());
  const snapshot = await readSnapshot(snapshotId);

  if (options.dryRun) {
    console.log(
      chalk.yellow(
        `Would restore snapshot ${snapshot.id} (${snapshot.entries.length} paths)`,
      ),
    );
    for (const entry of snapshot.entries) {
      console.log(`  ${entry.path} <- ${entry.state}`);
    }
    return;
  }

  await restoreSnapshot(snapshot.id);
  console.log(chalk.green(`Restored snapshot ${snapshot.id}`));
}

async function getLatestSnapshotId(): Promise<string> {
  const snapshots = await listSnapshots();
  if (snapshots.length === 0) {
    throw new Error("No snapshots available.");
  }
  return snapshots[0].id;
}
