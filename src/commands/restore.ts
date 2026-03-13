import * as p from "@clack/prompts";
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
  p.intro("link-agents restore");

  if (options.list) {
    const snapshots = await listSnapshots();
    if (snapshots.length === 0) {
      p.outro("No snapshots available.");
      return;
    }
    const lines = formatSnapshotList(snapshots);
    p.note(lines.join("\n"), `Snapshots (${snapshots.length})`);
    p.outro("");
    return;
  }

  const snapshotId = options.id ?? (await getLatestSnapshotId());
  const snapshot = await readSnapshot(snapshotId);

  if (options.dryRun) {
    const lines = snapshot.entries.map(
      (entry) => `${entry.path} <- ${entry.state}`,
    );
    p.note(
      lines.join("\n"),
      `Would restore ${snapshot.id} (${snapshot.entries.length} paths)`,
    );
    p.outro("Dry run -- no changes made");
    return;
  }

  const spin = p.spinner();
  spin.start(`Restoring snapshot ${snapshot.id.slice(0, 12)}...`);
  await restoreSnapshot(snapshot.id);
  spin.stop(`Restored ${snapshot.entries.length} paths`);
  p.outro("Restore complete");
}

async function getLatestSnapshotId(): Promise<string> {
  const snapshots = await listSnapshots();
  if (snapshots.length === 0) {
    throw new Error("No snapshots available.");
  }
  return snapshots[0].id;
}
