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
import { transformContentForClient } from "../utils/frontmatter.js";
import { formatIssueSection } from "../utils/reporting.js";
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

  console.log(chalk.cyan("Doctor"));
  console.log(`  Canonical assets: ${canonicalAssets.length}`);
  console.log(`  Tracked generated targets: ${state.generated.length}`);
  console.log();

  const ignoredLines = formatIssueSection(
    "Ignored legacy inputs",
    ignoredCursorRules.map((asset) => asset.path),
  );
  if (ignoredLines.length > 0) {
    issues += ignoredCursorRules.length;
    console.log(chalk.yellow(ignoredLines[0]));
    for (const line of ignoredLines.slice(1)) {
      console.log(line);
    }
  }

  const bootstrapEligible = [...legacyKeys.entries()].filter(
    ([key]) => !canonicalKeys.has(key),
  );
  const bootstrapLines = formatIssueSection(
    "Missing canonical assets eligible for bootstrap",
    bootstrapEligible.map(
      ([key, candidates]) =>
        `${key} <- ${candidates.map((asset) => asset.client).join(", ")}`,
    ),
  );
  if (bootstrapLines.length > 0) {
    issues += bootstrapEligible.length;
    console.log(chalk.yellow(bootstrapLines[0]));
    for (const line of bootstrapLines.slice(1)) {
      console.log(line);
    }
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
        const expected =
          entry.expectedContent ??
          transformContentForClient(
            await fs.readFile(entry.sourcePath, "utf8"),
            entry.targetClient,
            entry.type,
          );
        if (current !== expected) {
          driftedCopies.push(entry.path);
        }
      }
    } catch {
      brokenLinks.push(entry.path);
    }
  }

  const brokenLines = formatIssueSection(
    "Broken generated links/targets",
    brokenLinks,
  );
  if (brokenLines.length > 0) {
    issues += brokenLinks.length;
    console.log(chalk.red(brokenLines[0]));
    for (const line of brokenLines.slice(1)) {
      console.log(line);
    }
  }

  const driftLines = formatIssueSection(
    "Generated copies drifted from canonical source",
    driftedCopies,
  );
  if (driftLines.length > 0) {
    issues += driftedCopies.length;
    console.log(chalk.yellow(driftLines[0]));
    for (const line of driftLines.slice(1)) {
      console.log(line);
    }
  }

  if (issues === 0) {
    console.log(chalk.green("doctor: no issues found"));
  }
}
