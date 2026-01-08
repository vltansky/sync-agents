# sync-agents

Synchronize `AGENTS.md`, commands, rules, skills, and MCP configs across AI coding assistants (Codex, Claude Code, Cursor, OpenCode) plus your current project.

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
| `--link`                  | Use symlinks instead of copying files                           |
| `--reset`                 | Remove all sync-agents generated files and reset                |
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

| Client    | Location              | Agents         | Rules              | Commands           | MCP              |
| --------- | --------------------- | -------------- | ------------------ | ------------------ | ---------------- |
| `project` | `./`                  | `AGENTS.md`    | `rules/**/*.md`    | `commands/**/*.md` | `.cursor/mcp.json` |
| `codex`   | `~/.codex`            | `AGENTS.md`    | `rules/**/*.rules` | `prompts/**/*.md`  | `config.toml`    |
| `claude`  | `~/.claude`           | `CLAUDE.md`    | *(merged into agents)* | `commands/**/*.md` | —                |
| `cursor`  | `~/.cursor`           | `AGENTS.md`    | `rules/**/*.md`    | `commands/**/*.md` | `mcp.json`       |
| `opencode`| `~/.config/opencode`  | `AGENTS.md`    | `rules/**/*.md`    | `command/**/*.md`  | `opencode.jsonc` |

### Path Mappings

When syncing between clients, paths are automatically mapped:

| From | To | Mapping |
| ---- | -- | ------- |
| Any client | Codex | `commands/` → `prompts/` |
| Any client | OpenCode | `commands/` → `command/` (singular) |
| Any client | OpenCode | `skills/` → `skill/` (singular) |
| Any client | Claude | `AGENTS.md` → `CLAUDE.md` |
| Cursor rules | Claude/Codex | Rules merged into `AGENTS.md`/`CLAUDE.md` |

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

Reset all sync-agents generated files:

```bash
npx sync-agents --reset
```

## Roadmap

### Planned Client Support

| Client | Location | Config Format | Status |
| ------ | -------- | ------------- | ------ |
| **Claude Desktop** | `~/Library/Application Support/Claude` | `claude_desktop_config.json` (MCP only) | 🔜 Planned |
| **Windsurf** | `~/.codeium/windsurf` | `.windsurfrules`, `mcp_config.json` | 🔜 Planned |
| **Cline** | VS Code globalStorage | `cline_mcp_settings.json`, `.clinerules` | 🔜 Planned |
| **Roo Code** | VS Code globalStorage | Same as Cline (fork) | 🔜 Planned |
| **Aider** | `~/.aider.conf.yml` | YAML config, `CONVENTIONS.md` | 🔜 Planned |
| **Gemini CLI** | `~/.gemini` | Unknown | 🔍 Research |
| **VS Code** | `~/Library/Application Support/Code/User` | `settings.json` | 🔍 Research |
| **Antigravity** | `~/Library/Application Support/Antigravity` | Unknown | 🔍 Research |
| **Goose** | `~/.config/goose` | YAML config | 🔍 Research |

### Known Config Formats

| Format | Used By | Notes |
| ------ | ------- | ----- |
| `AGENTS.md` / `CLAUDE.md` | Codex, Claude, Cursor, OpenCode | Markdown agent instructions |
| `rules/**/*.md` | Cursor, OpenCode | Always-applied rules |
| `rules/**/*.mdc` | Cursor | MDC format rules |
| `commands/**/*.md` | Claude, Cursor | Slash commands |
| `prompts/**/*.md` | Codex | Slash commands (Codex naming) |
| `mcp.json` | Cursor | MCP server config |
| `config.toml` | Codex | TOML MCP config |
| `opencode.jsonc` | OpenCode | JSONC MCP config |
| `claude_desktop_config.json` | Claude Desktop | MCP only |
| `cline_mcp_settings.json` | Cline, Roo | MCP config |
| `.clinerules` | Cline | Global/local rules |
| `.windsurfrules` | Windsurf | Rules file |
| `.aider.conf.yml` | Aider | YAML config |
| `CONVENTIONS.md` | Aider | Coding conventions |

### Planned Features

- [ ] **Agent hooks sync** — Sync lifecycle hooks (PreToolUse, afterFileEdit, etc.) to `.claude/settings.json` and `.cursor/hooks.json`
- [ ] **Transforms** — Content placeholders like `__TIMESTAMP__`, `__STRUCTURE__`, `__ENV_VAR__`
- [ ] **Migrate command** — Consolidate existing configs into a canonical `.agents/` directory
- [ ] **Skill installer** — Install skills from local path, git URL, or HTTPS URL
- [ ] **Canonical mode** — Use `.agents/` as single source of truth with symlinks (like dotagents)
