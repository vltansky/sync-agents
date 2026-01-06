# sync-agents

Synchronize `AGENTS.md`, commands, rules, skills, and MCP configs across AI coding assistants (Codex, Claude Code, Cursor, Windsurf, Cline, Roo Code, Gemini CLI, OpenCode, VS Code, Antigravity, Goose) plus your current project.

## Quick Start

```bash
npx sync-agents
```

This launches an interactive wizard that:

1. Asks what to sync (project files, global configs, or both)
2. Scans all available clients
3. Shows conflicts and lets you choose how to resolve them
4. Lets you pick sync direction (push/pull)
5. Previews changes before applying

## Use Cases

### Push project rules to all your tools

```bash
npx sync-agents --project --push
```

Your `./AGENTS.md` and `./rules/*` become the source of truth for all AI assistants.

### Pull global configs into your project

```bash
npx sync-agents --project --pull
```

Copy rules from `~/.claude`, `~/.cursor`, etc. into your project.

### Sync only global configs

```bash
npx sync-agents --global
```

Keep `~/.claude`, `~/.cursor`, `~/.codex`, etc. in sync with each other (doesn't touch project files).

### Migrate from Cursor

```bash
npx sync-agents --export-cursor-history
```

Exports Cursor's "Rules & Config" history to `~/.cursor/AGENTS.md`, then you can sync it everywhere.

## CLI Options

| Flag                      | Description                                                     |
| ------------------------- | --------------------------------------------------------------- |
| `--project`               | Sync only project files (`./AGENTS.md`, `./rules/*`, etc.)      |
| `--global`                | Sync only global configs (`~/.cursor`, `~/.claude`, etc.)       |
| `--push`                  | Push project files → global clients                             |
| `--pull`                  | Pull global client files → project                              |
| `-m, --mode`              | `interactive` (default), `merge`, or `source`                   |
| `-s, --source`            | Source client when using `--mode source`                        |
| `-c, --clients`           | Comma-separated client list                                     |
| `-t, --types`             | Filter asset types (`agents,commands,rules,skills,mcp,prompts`) |
| `--priority`              | Client precedence order when merging                            |
| `--dry-run`               | Preview without writing                                         |
| `-v, --verbose`           | Verbose output                                                  |
| `--export-cursor-history` | Export Cursor UI history to `~/.cursor/AGENTS.md`               |
| `--cursor-history-dest`   | Custom destination for Cursor history export                    |

## How It Works

1. **Scan** - Finds assets in project and global client directories
2. **Detect conflicts** - Groups files by type and path, identifies different versions
3. **Resolve** - For each conflict, choose: use version A, use version B, merge, or skip
4. **Plan** - Builds a list of files to create/update
5. **Apply** - Writes files to target locations

## Supported Clients

| Client        | Location                                         | Notes                      |
| ------------- | ------------------------------------------------ | -------------------------- |
| `project`     | `./`                                             | Current working directory  |
| `codex`       | `~/.codex`                                       |                            |
| `claude`      | `~/.claude`                                      | `CLAUDE.md` ↔ `AGENTS.md` |
| `cursor`      | `~/.cursor`                                      | Supports `.mdc` rules      |
| `opencode`    | `~/.opencode`                                    |                            |
| `windsurf`    | `~/.codeium/windsurf`                            |                            |
| `cline`       | `~/.cline`                                       |                            |
| `roo`         | `~/.roo`                                         |                            |
| `gemini`      | `~/.gemini`                                      |                            |
| `vscode`      | `~/Library/Application Support/Code/User`        |                            |
| `antigravity` | `~/Library/Application Support/Antigravity/User` |                            |
| `goose`       | `~/.config/goose`                                |                            |

## Examples

Sync commands between Claude and Cursor only:

```bash
npx sync-agents --mode merge --clients claude,cursor --types commands
```

Use Claude as the source of truth:

```bash
npx sync-agents --mode source --source claude
```

Preview what would change:

```bash
npx sync-agents --dry-run
```

## Roadmap

- Diff previews per file in interactive mode
- Backup snapshots before overwriting
- Hooks for custom client directories

PRs and ideas welcome!
