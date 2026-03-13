#!/usr/bin/env node
import process from "node:process";
import * as p from "@clack/prompts";
import { CommanderError } from "commander";
import { parseCliArgs } from "./cli/options.js";
import { runSyncCommand } from "./commands/sync.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRestoreCommand } from "./commands/restore.js";

async function main() {
  const options = parseCliArgs(process.argv);

  if (options.command === "sync") {
    await runSyncCommand(options);
    return;
  }

  if (options.command === "doctor") {
    await runDoctorCommand(options);
    return;
  }

  await runRestoreCommand(options);
}

main().catch((error) => {
  if (
    error instanceof CommanderError &&
    error.code === "commander.helpDisplayed"
  ) {
    process.exitCode = 0;
    return;
  }

  p.cancel(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
