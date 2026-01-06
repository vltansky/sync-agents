import chalk from "chalk";
import type { SyncOptions, SyncPlanEntry } from "../types/index.js";
import { writeFileSafe, createSymlink } from "./fs.js";

export async function applyPlan(
  plan: SyncPlanEntry[],
  options: SyncOptions,
): Promise<void> {
  if (plan.length === 0) {
    if (options.verbose) {
      console.log(chalk.green("No changes required."));
    }
    return;
  }

  const useSymlinks = options.link ?? false;

  for (const entry of plan) {
    const displayPath = entry.targetRelativePath ?? entry.asset.relativePath;

    if (entry.action === "skip") {
      if (options.verbose) {
        console.log(
          chalk.gray(`skip   ${entry.targetClient} :: ${displayPath}`),
        );
      }
      continue;
    }

    if (options.dryRun) {
      const action = useSymlinks ? "link" : entry.action;
      console.log(
        chalk.yellow(
          `${action.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
        ),
      );
      continue;
    }

    if (useSymlinks) {
      await createSymlink(entry.asset.path, entry.targetPath);
      console.log(
        chalk.cyan(
          `link    ${entry.targetClient} :: ${displayPath} -> ${entry.asset.path}`,
        ),
      );
    } else {
      await writeFileSafe(entry.targetPath, entry.asset.content);
      console.log(
        chalk.green(
          `${entry.action.padEnd(7)} ${entry.targetClient} :: ${displayPath}`,
        ),
      );
    }
  }
}
