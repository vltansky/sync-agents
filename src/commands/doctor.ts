import * as p from "@clack/prompts";
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
import type { DoctorCommandOptions } from "../types/index.js";

export async function runDoctorCommand(
  options: DoctorCommandOptions,
): Promise<void> {
  p.intro("link-agents doctor");

  const projectRoot = options.root;
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

  p.note(
    [
      `Canonical assets:          ${canonicalAssets.length}`,
      `Tracked generated targets: ${state.generated.length}`,
    ].join("\n"),
    "Status",
  );

  if (ignoredCursorRules.length > 0) {
    issues += ignoredCursorRules.length;
    p.log.warn(
      `${ignoredCursorRules.length} ignored legacy cursor rule(s)\n` +
        ignoredCursorRules.map((a) => `  ${a.path}`).join("\n"),
    );
  }

  const bootstrapEligible = [...legacyKeys.entries()].filter(
    ([key]) => !canonicalKeys.has(key),
  );
  if (bootstrapEligible.length > 0) {
    issues += bootstrapEligible.length;
    p.log.warn(
      `${bootstrapEligible.length} asset(s) eligible for bootstrap\n` +
        bootstrapEligible
          .map(
            ([key, candidates]) =>
              `  ${key} <- ${candidates.map((a) => a.client).join(", ")}`,
          )
          .join("\n"),
    );
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

  if (brokenLinks.length > 0) {
    issues += brokenLinks.length;
    p.log.error(
      `${brokenLinks.length} broken link(s)\n` +
        brokenLinks.map((l) => `  ${l}`).join("\n"),
    );
  }

  if (driftedCopies.length > 0) {
    issues += driftedCopies.length;
    p.log.warn(
      `${driftedCopies.length} drifted copy/copies\n` +
        driftedCopies.map((d) => `  ${d}`).join("\n"),
    );
  }

  if (issues === 0) {
    p.outro("No issues found");
  } else {
    p.outro(`${issues} issue(s) found`);
  }
}
