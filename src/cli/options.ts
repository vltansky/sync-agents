import { Command } from "commander";
import type {
  AgentClientName,
  AssetType,
  SyncOptions,
  SyncScope,
  SyncDirection,
} from "../types/index.js";

const CLIENT_CHOICES: AgentClientName[] = [
  "project",
  "codex",
  "claude",
  "claudeDesktop",
  "cursor",
  "opencode",
  "windsurf",
  "cline",
  "roo",
  "gemini",
  "vscode",
  "antigravity",
  "goose",
];
const TYPE_CHOICES: AssetType[] = [
  "agents",
  "commands",
  "rules",
  "skills",
  "mcp",
  "prompts",
];

type Mode = SyncOptions["mode"];

export function parseCliArgs(argv: string[]): SyncOptions {
  const program = new Command();

  program
    .name("sync-agents")
    .description("Synchronize agent instructions across AI coding assistants")
    .option(
      "-m, --mode <mode>",
      "sync mode: interactive | merge | source",
      "interactive",
    )
    .option(
      "--project",
      "sync only project files (./AGENTS.md, ./rules/*, etc.)",
    )
    .option("--global", "sync only global configs (~/.cursor, ~/.claude, etc.)")
    .option("--push", "push project files to global clients")
    .option("--pull", "pull global client files into project")
    .option("-s, --source <client>", "source client when using --mode source")
    .option("-c, --clients <list>", "comma-separated list of clients to target")
    .option("-t, --types <list>", "comma-separated list of asset types to sync")
    .option("--priority <list>", "client priority order (highest first)")
    .option(
      "--export-cursor-history",
      "aggregate Cursor UI rules into a local file before syncing",
    )
    .option(
      "--cursor-history-dest <file>",
      "destination file for exported Cursor history (default: ~/.cursor/AGENTS.md)",
    )
    .option("--dry-run", "preview without writing changes")
    .option("--link", "use symlinks instead of copying files")
    .option("-v, --verbose", "verbose output");

  program.parse(argv);

  const opts = program.opts();

  const mode = normalizeMode(opts.mode);
  const scope = resolveScope(opts.project, opts.global);
  const direction = resolveDirection(opts.push, opts.pull);
  const selectedClients = opts.clients
    ? parseList(opts.clients, CLIENT_CHOICES)
    : undefined;
  const types = opts.types ? parseList(opts.types, TYPE_CHOICES) : undefined;
  const priority = opts.priority
    ? parseList(opts.priority, CLIENT_CHOICES)
    : undefined;

  if (mode === "source" && !opts.source) {
    throw new Error("Source mode requires --source <client>");
  }

  if (opts.source && !CLIENT_CHOICES.includes(opts.source)) {
    throw new Error(`Unknown source client: ${opts.source}`);
  }

  if (opts.project && opts.global) {
    throw new Error("Cannot use --project and --global together");
  }

  if (opts.push && opts.pull) {
    throw new Error("Cannot use --push and --pull together");
  }

  return {
    mode,
    scope,
    direction,
    source: opts.source,
    clients: selectedClients,
    types,
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose),
    priority,
    exportCursorHistory: Boolean(opts.exportCursorHistory),
    cursorHistoryDest: opts.cursorHistoryDest,
    link: Boolean(opts.link),
  } satisfies SyncOptions;
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

function normalizeMode(value: string): Mode {
  if (value === "interactive" || value === "merge" || value === "source") {
    return value;
  }
  throw new Error(`Unknown mode: ${value}`);
}

function resolveScope(project?: boolean, global?: boolean): SyncScope {
  if (project) return "project";
  if (global) return "global";
  return "all";
}

function resolveDirection(push?: boolean, pull?: boolean): SyncDirection {
  if (push) return "push";
  if (pull) return "pull";
  return "sync";
}
