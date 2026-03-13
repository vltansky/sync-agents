import { describe, expect, it } from "vitest";
import { hashContent } from "./fs.js";
import {
  buildDetailedPlanLines,
  buildSyncPlanSummaryLines,
  buildSyncPreflightLines,
  formatIssueSection,
  formatSnapshotList,
} from "./reporting.js";
import type { SyncPlanEntry } from "../types/index.js";

function makeEntry(
  type: SyncPlanEntry["asset"]["type"],
  targetClient: SyncPlanEntry["targetClient"],
  targetPath: string,
  reason: SyncPlanEntry["reason"],
): SyncPlanEntry {
  const canonicalPath =
    type === "mcp"
      ? "mcp.json"
      : type === "agents"
        ? "AGENTS.md"
        : `${type}/demo.md`;
  return {
    asset: {
      client: "project",
      type,
      path: `/repo/.agents/${canonicalPath}`,
      relativePath: canonicalPath,
      canonicalPath,
      name: canonicalPath,
      content: canonicalPath,
      hash: hashContent(canonicalPath),
    },
    targetClient,
    targetPath,
    action: "create",
    reason,
  };
}

describe("reporting", () => {
  it("formats sync preflight lines", () => {
    expect(
      buildSyncPreflightLines({
        canonicalCount: 4,
        bootstrapCount: 1,
        ignoredCount: 2,
        targets: ["claude", "cursor"],
        writeMode: "copy",
        dryRun: true,
        types: ["agents", "commands"],
      }),
    ).toEqual([
      "Mode: dry-run",
      "Write mode: copy",
      "Canonical assets: 4",
      "Bootstrap actions: 1",
      "Ignored legacy inputs: 2",
      "Targets: claude, cursor",
      "Managed types: agents, commands",
    ]);
  });

  it("groups sync plan lines by phase and client", () => {
    const lines = buildSyncPlanSummaryLines([
      makeEntry("agents", "project", "/repo/.agents/AGENTS.md", "bootstrap"),
      makeEntry(
        "commands",
        "codex",
        "/home/.codex/skills/commands/review/SKILL.md",
        "fanout",
      ),
      makeEntry("mcp", "cursor", "/home/.cursor/mcp.json", "fanout"),
      makeEntry("agents", "cursor", "/home/.cursor/AGENTS.md", "fanout"),
    ]);

    expect(lines).toEqual([
      "bootstrap   1 change (agents 1)",
      "fanout      codex: 1 change (commands 1)",
      "fanout      cursor: 2 changes (agents 1, mcp 1)",
    ]);
  });

  it("formats detailed plan lines", () => {
    expect(
      buildDetailedPlanLines([
        makeEntry("agents", "project", "/repo/.agents/AGENTS.md", "bootstrap"),
        makeEntry(
          "commands",
          "claude",
          "/home/.claude/commands/review.md",
          "fanout",
        ),
      ]),
    ).toEqual([
      "bootstrap  /repo/.agents/AGENTS.md",
      "fanout     /home/.claude/commands/review.md",
    ]);
  });

  it("formats issue sections with counts", () => {
    expect(
      formatIssueSection("Ignored legacy inputs", ["/tmp/a", "/tmp/b"]),
    ).toEqual(["Ignored legacy inputs (2)", "  /tmp/a", "  /tmp/b", ""]);
  });

  it("formats snapshot lists with path counts", () => {
    expect(
      formatSnapshotList([
        { id: "snap-1", createdAt: "2026-03-13T11:00:00Z", entries: [{}, {}] },
      ]),
    ).toEqual(["snap-1  2026-03-13T11:00:00Z  (2 paths)"]);
  });
});
