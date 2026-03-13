import { Command } from "commander";
import type {
  AgentClientName,
  CliCommandOptions,
  ManagedAssetType,
} from "../types/index.js";

const CLIENT_CHOICES: AgentClientName[] = [
  "codex",
  "claude",
  "cursor",
  "opencode",
];
const TYPE_CHOICES: ManagedAssetType[] = [
  "agents",
  "commands",
  "skills",
  "mcp",
];

export function parseCliArgs(argv: string[]): CliCommandOptions {
  const program = new Command();
  let parsed: CliCommandOptions | null = null;

  program
    .name("agsync")
    .description(
      "Synchronize canonical .agents assets across AI coding assistants",
    )
    .showHelpAfterError()
    .exitOverride();

  program
    .command("sync")
    .description(
      "Bootstrap canonical .agents assets if needed and sync them to clients",
    )
    .option("-c, --clients <list>", "comma-separated list of clients to target")
    .option("-t, --types <list>", "comma-separated list of asset types to sync")
    .option("--dry-run", "preview without writing changes")
    .option("-v, --verbose", "verbose output")
    .option(
      "--link",
      "prefer symlinks when target bytes can reuse canonical bytes",
    )
    .option("--copy", "always write independent copies")
    .option(
      "--separate-claude-md",
      "leave Claude's CLAUDE.md unmanaged during sync",
    )
    .option(
      "--bootstrap-source <client>",
      "explicit source client when canonical bootstrap is ambiguous",
    )
    .action((opts) => {
      if (opts.link && opts.copy) {
        throw new Error("Cannot use --link and --copy together");
      }
      if (
        opts.bootstrapSource &&
        !CLIENT_CHOICES.includes(opts.bootstrapSource)
      ) {
        throw new Error(
          `Invalid value: ${opts.bootstrapSource}. Allowed: ${CLIENT_CHOICES.join(", ")}`,
        );
      }

      parsed = {
        command: "sync",
        clients: opts.clients
          ? parseList(opts.clients, CLIENT_CHOICES)
          : undefined,
        types: opts.types ? parseList(opts.types, TYPE_CHOICES) : undefined,
        dryRun: Boolean(opts.dryRun),
        verbose: Boolean(opts.verbose),
        link: Boolean(opts.link),
        copy: Boolean(opts.copy),
        separateClaudeMd: Boolean(opts.separateClaudeMd),
        bootstrapSource: opts.bootstrapSource,
      };
    });

  program
    .command("doctor")
    .description(
      "Inspect canonical sync health, drift, and ignored legacy inputs",
    )
    .option(
      "-c, --clients <list>",
      "comma-separated list of clients to inspect",
    )
    .option(
      "-t, --types <list>",
      "comma-separated list of asset types to inspect",
    )
    .option("-v, --verbose", "verbose output")
    .action((opts) => {
      parsed = {
        command: "doctor",
        clients: opts.clients
          ? parseList(opts.clients, CLIENT_CHOICES)
          : undefined,
        types: opts.types ? parseList(opts.types, TYPE_CHOICES) : undefined,
        verbose: Boolean(opts.verbose),
      };
    });

  program
    .command("restore")
    .description("Restore agsync managed files from a snapshot")
    .option("--latest", "restore the most recent snapshot")
    .option("--list", "list available snapshots")
    .option("--id <snapshotId>", "restore a specific snapshot")
    .option("--dry-run", "preview without writing changes")
    .option("-v, --verbose", "verbose output")
    .action((opts) => {
      const selectors = [
        Boolean(opts.latest),
        Boolean(opts.list),
        Boolean(opts.id),
      ].filter(Boolean);
      if (selectors.length !== 1) {
        throw new Error("restore requires one of --latest, --list, or --id");
      }

      parsed = {
        command: "restore",
        latest: Boolean(opts.latest),
        list: Boolean(opts.list),
        id: opts.id,
        dryRun: Boolean(opts.dryRun),
        verbose: Boolean(opts.verbose),
      };
    });

  program.parse(argv, { from: "node" });

  if (!parsed) {
    throw new Error("A subcommand is required: sync, doctor, or restore");
  }

  return parsed;
}

function parseList<T extends string>(
  value: string,
  allowed: readonly T[],
): T[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (!allowed.includes(item as T)) {
        throw new Error(
          `Invalid value: ${item}. Allowed: ${allowed.join(", ")}`,
        );
      }
      return item as T;
    });
}
