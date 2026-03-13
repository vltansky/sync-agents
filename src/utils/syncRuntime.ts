import chalk from "chalk";
import type { ApplyResult } from "./apply.js";

export function printApplyResultLike(
  result: ApplyResult,
  verbose: boolean,
): void {
  const parts: string[] = [];

  if (result.applied > 0) {
    parts.push(chalk.green(`${result.applied} applied`));
  }
  if (result.skipped > 0) {
    parts.push(chalk.gray(`${result.skipped} skipped`));
  }
  if (result.failed > 0) {
    parts.push(chalk.red(`${result.failed} failed`));
  }
  if (result.rolledBack) {
    parts.push(chalk.yellow("rolled back"));
  }

  if (parts.length > 0) {
    console.log();
    console.log(`Done: ${parts.join(", ")}`);
  }

  if (result.backups.length > 0 && verbose) {
    console.log(chalk.dim(`Created ${result.backups.length} backup(s)`));
  }

  if (result.errors.length > 0) {
    console.log();
    console.log(chalk.red("Errors:"));
    for (const error of result.errors) {
      console.log(chalk.red(`  - ${error}`));
    }
  }
}
