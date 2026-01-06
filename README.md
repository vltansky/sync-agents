# sync-agents

Synchronize `AGENTS.md`, commands, rules, skills, and MCP configs across AI coding assistants (Codex, Claude Code, Cursor, Windsurf, Cline, Roo Code, Gemini CLI, OpenCode, VS Code, Antigravity, Goose) plus your current project. Inspired by `sync-project-mcps`, but focused on the higher-level guidance artifacts that keep assistants aligned.

## Why?

Each assistant stores its guidance files in different hidden folders. Keeping them in sync manually is tedious and error-prone. `sync-agents` discovers existing assets, builds a merge plan, and writes the unified result back to every client so your playbooks stay consistent everywhere.

## Quick Start

```bash
npx -y sync-agents@latest
```

Default mode is **interactive**: you get a summary of planned actions and must confirm before files change.

### Silent Merge

```bash
sync-agents --mode merge --dry-run   # preview
sync-agents --mode merge             # union all assets, apply immediately
```

### Source of Truth

```bash
sync-agents --mode source --source claude --dry-run
sync-agents --mode source --source claude
```

Source mode mirrors one client's assets into all others (removing divergent copies).

## CLI Options

| Flag | Description |
|------|-------------|
| `-m, --mode` | `interactive` (default), `merge`, or `source` |
| `-s, --source` | Required when `--mode source` |
| `-c, --clients` | Comma-separated subset (`project,codex,claude,cursor,windsurf,cline,roo,gemini,opencode,vscode,antigravity,goose`) |
| `-t, --types` | Filter asset types (`agents,commands,rules,skills,mcp`) |
| `--priority` | Client precedence order when merging |
| `--dry-run` | Show planned writes without touching disk |
| `-v, --verbose` | Log skips/up-to-date entries |
| `--export-cursor-history` | Aggregate Cursor UI “Rules & Config” history into a local file before syncing |
| `--cursor-history-dest` | Destination for the aggregated Cursor history (default: `~/.cursor/AGENTS.history.md`) |

## How It Works

1. **Discover**: scans the current project plus each assistant’s home (Codex, Claude, Cursor, Windsurf, Cline, Roo Code, Gemini CLI, OpenCode, VS Code, Antigravity, Goose) for `AGENTS.md`, commands, rules, skills, and MCP config files.
2. **Normalize**: converts every file into a canonical asset key (type + relative path + content hash).
3. **Plan**: merges assets using either additive priority order or a single source of truth.
4. **Confirm** (interactive mode): shows stats and waits for approval.
5. **Apply**: writes the resulting files back to every client root, creating directories as needed.

## Supported Clients

- `project` – current working directory (mirrors repo AGENTS/rules)
- `codex` – `~/.codex`
- `claude` – `~/.claude`
- `cursor` – `~/.cursor`
- `windsurf` – `~/.codeium/windsurf`
- `cline` – `~/.cline`
- `roo` – `~/.roo`
- `gemini` – `~/.gemini`
- `opencode` – `~/.opencode`
- `vscode` – VS Code user directory (e.g. `~/Library/Application Support/Code/User`)
- `antigravity` – Antigravity user directory (e.g. `~/Library/Application Support/Antigravity/User`)
- `goose` – `~/.config/goose`
- `CLAUDE.md` files are normalized to `AGENTS.md` when sharing between assistants so Claude’s instructions stay in sync with everyone else.

### Cursor-Specific Behavior

- `.cursor/rules/*.md{c}` files are parsed: entries with `alwaysApply: true` sync as rules, while non-`alwaysApply` entries are treated as skills (`skills/cursor-rules/...`) for other assistants.
- Cursor’s `~/Library/Application Support/Cursor/User/History/**.md` “Rules & Config” copies are ingested as read-only sources and can be replicated to other clients. Use `--export-cursor-history` to flatten them into a single file (optionally point `--cursor-history-dest` to `~/.cursor/AGENTS.md` for migration).
- Auto-attached rules from Cursor are intentionally ignored for now; track them manually or export via the flag above until tooling is added.

## Examples

Sync only commands between Claude and Cursor:

```bash
sync-agents --mode merge --clients claude,cursor --types commands
```

Use project files as canonical definitions:

```bash
sync-agents --mode source --source project
```

## Roadmap

- Diff previews per file in interactive mode
- Backup snapshots before overwriting
- Hooks for custom client directories or cloud storage

PRs and ideas welcome!
