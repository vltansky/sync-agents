import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import {
  discoverCanonicalAssets,
  discoverIgnoredCursorRules,
  discoverLegacyAssets,
  groupAssetsByCanonicalKey,
} from "../utils/canonical.js";
import { readCanonicalState } from "../utils/canonicalState.js";
import type { DoctorCommandOptions } from "../types/index.js";

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  const projectRoot = process.cwd();
  const canonicalAssets = await discoverCanonicalAssets(
    projectRoot,
    options.types,
  );
  const legacyAssets = await discoverLegacyAssets(projectRoot, options.types);
  const ignoredCursorRules = await discoverIgnoredCursorRules(projectRoot);
  const state = await readCanonicalState();

  const canonicalKeys = new Set(
    groupAssetsByCanonicalKey(canonicalAssets).keys(),
  );
  const legacyKeys = groupAssetsByCanonicalKey(
    legacyAssets.filter((asset) => asset.type !== "rules"),
  );

  let issues = 0;

  if (ignoredCursorRules.length > 0) {
    issues += ignoredCursorRules.length;
    console.log(chalk.yellow("Ignored legacy inputs:"));
    for (const asset of ignoredCursorRules) {
      console.log(`  ${asset.path}`);
    }
    console.log();
  }

  const bootstrapEligible = [...legacyKeys.entries()].filter(
    ([key]) => !canonicalKeys.has(key),
  );
  if (bootstrapEligible.length > 0) {
    issues += bootstrapEligible.length;
    console.log(
      chalk.yellow("Missing canonical assets eligible for bootstrap:"),
    );
    for (const [key, candidates] of bootstrapEligible) {
      console.log(
        `  ${key} <- ${candidates.map((asset) => asset.client).join(", ")}`,
      );
    }
    console.log();
  }

  const brokenLinks: string[] = [];
  const driftedCopies: string[] = [];

  for (const entry of state.generated) {
    try {
      const stats = await fs.lstat(entry.path);
      if (stats.isSymbolicLink()) {
        const linkTarget = await fs.readlink(entry.path);
        const resolved = path.resolve(path.dirname(entry.path), linkTarget);
        await fs.access(resolved);
      } else {
        const current = await fs.readFile(entry.path, "utf8");
        const source = await fs.readFile(entry.sourcePath, "utf8");
        if (current !== source) {
          driftedCopies.push(entry.path);
        }
      }
    } catch {
      brokenLinks.push(entry.path);
    }
  }

  if (brokenLinks.length > 0) {
    issues += brokenLinks.length;
    console.log(chalk.red("Broken generated links/targets:"));
    for (const file of brokenLinks) {
      console.log(`  ${file}`);
    }
    console.log();
  }

  if (driftedCopies.length > 0) {
    issues += driftedCopies.length;
    console.log(
      chalk.yellow("Generated copies drifted from canonical source:"),
    );
    for (const file of driftedCopies) {
      console.log(`  ${file}`);
    }
    console.log();
  }

  if (issues === 0) {
    console.log(chalk.green("doctor: no issues found"));
  }
}
