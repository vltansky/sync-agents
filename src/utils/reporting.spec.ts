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
  const content =
    type === "mcp"
      ? JSON.stringify({
          mcpServers: {
            server1: { command: "npx" },
            server2: { url: "http://x" },
          },
        })
      : canonicalPath;
  return {
    asset: {
      client: "canonical",
      type,
      path: `/repo/.agents/${canonicalPath}`,
      relativePath: canonicalPath,
      canonicalPath,
      name: canonicalPath,
      content,
      hash: hashContent(content),
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
        types: ["agents", "skills"],
      }),
    ).toEqual([
      "Mode: dry-run",
      "Write mode: copy",
      "Canonical assets: 4",
      "Imported from clients: 1",
      "Ignored legacy inputs: 2",
      "Targets: claude, cursor",
      "Managed types: agents, skills",
    ]);
  });

  it("groups sync plan lines by phase and client", () => {
    const lines = buildSyncPlanSummaryLines([
      makeEntry("agents", "canonical", "/repo/.agents/AGENTS.md", "import"),
      makeEntry(
        "skills",
        "codex",
        "/home/.codex/skills/commands/review/SKILL.md",
        "sync",
      ),
      makeEntry("mcp", "cursor", "/home/.cursor/mcp.json", "sync"),
      makeEntry("agents", "cursor", "/home/.cursor/AGENTS.md", "sync"),
    ]);

    expect(lines).toEqual([
      "import      1 change (AGENTS.md)",
      "sync        codex: 1 change (1 skills)",
      "sync        cursor: 2 changes (AGENTS.md, 2 mcp)",
    ]);
  });

  it("formats detailed plan lines", () => {
    expect(
      buildDetailedPlanLines([
        makeEntry("agents", "canonical", "/repo/.agents/AGENTS.md", "import"),
        makeEntry(
          "skills",
          "claude",
          "/home/.claude/skills/commands/review/SKILL.md",
          "sync",
        ),
      ]),
    ).toEqual([
      "import     /repo/.agents/AGENTS.md",
      "sync       /home/.claude/skills/commands/review/SKILL.md",
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
