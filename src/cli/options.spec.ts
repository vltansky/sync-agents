import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./options.js";

describe("parseCliArgs", () => {
  it("parses sync subcommand options", () => {
    const result = parseCliArgs([
      "node",
      "link-agents",
      "sync",
      "--dry-run",
      "--link",
      "--separate-claude-md",
      "--bootstrap-source",
      "claude",
      "--types",
      "agents,mcp",
    ]);

    expect(result).toEqual({
      command: "sync",
      dryRun: true,
      verbose: false,
      link: true,
      copy: false,
      separateClaudeMd: true,
      bootstrapSource: "claude",
      types: ["agents", "mcp"],
    });
  });

  it("parses doctor subcommand", () => {
    const result = parseCliArgs(["node", "link-agents", "doctor", "--verbose"]);

    expect(result).toEqual({
      command: "doctor",
      verbose: true,
      types: undefined,
    });
  });

  it("parses restore subcommand", () => {
    const result = parseCliArgs([
      "node",
      "link-agents",
      "restore",
      "--id",
      "snapshot-123",
      "--dry-run",
    ]);

    expect(result).toEqual({
      command: "restore",
      id: "snapshot-123",
      latest: false,
      list: false,
      dryRun: true,
      verbose: false,
    });
  });

  it("defaults to sync when no subcommand is given", () => {
    const result = parseCliArgs(["node", "link-agents"]);
    expect(result).toEqual({
      command: "sync",
      dryRun: false,
      verbose: false,
      link: false,
      copy: false,
      separateClaudeMd: false,
      bootstrapSource: undefined,
      types: undefined,
    });
  });

  it("rejects passing both --link and --copy", () => {
    expect(() =>
      parseCliArgs(["node", "link-agents", "sync", "--link", "--copy"]),
    ).toThrow(/cannot use --link and --copy together/i);
  });

  it("requires a restore selector", () => {
    expect(() => parseCliArgs(["node", "link-agents", "restore"])).toThrow(
      /restore requires one of --latest, --list, or --id/i,
    );
  });
});
