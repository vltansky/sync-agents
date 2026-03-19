# link-agents

One command to keep your AI coding assistants in sync.

[Installation](#installation) | [Quick Start](#quick-start) | [Commands](#commands) | [Supported Clients](#supported-clients) | [How It Works](#how-it-works)

## Why?

Different AI coding tools — Claude Code, Codex, Cursor, OpenCode — each need their own config files. Keeping `AGENTS.md`, skills, and MCP server definitions consistent across all of them means duplicated files, manual updates, and inevitable drift.

`link-agents` fixes this with a single canonical source (`~/.agents/`) that automatically fans out to every client.

## Installation

```bash
npm install -g link-agents
```

Or run directly:

```bash
npx link-agents sync
```

Requires Node.js 18+.

## Quick Start

```bash
# Preview what would change
link-agents sync --dry-run

# Sync everything (will ask symlink vs copy)
link-agents sync

# Sync with symlinks (no prompt)
link-agents sync --link
```

Example output:

```
  Configuration
  Mode:        apply
  Write mode:  symlink
  Root:        ~/.agents
  Targets:     codex, claude, cursor, opencode

  Sync tree
  ~/.agents       13 MCP servers collected
  ~/.codex        AGENTS.md linked, 96 skills linked, MCP: 13 servers merged
  ~/.claude       AGENTS.md linked, 43 skills linked, MCP: 13 servers merged
  ~/.cursor       AGENTS.md linked, MCP: 13 servers merged

  Sync complete
```

## Supported Clients

| Client     | Root                 | AGENTS.md   | Skills               | MCP              |
| ---------- | -------------------- | ----------- | -------------------- | ---------------- |
| Codex      | `~/.codex`           | `AGENTS.md` | `skills/**/SKILL.md` | `config.toml`    |
| Claude Code| `~/.claude`          | `CLAUDE.md` | `skills/**/SKILL.md` | `~/.claude.json` |
| Cursor     | `~/.cursor`          | `AGENTS.md` | --                   | `mcp.json`       |
| OpenCode   | `~/.config/opencode` | `AGENTS.md` | `skill/**/SKILL.md`  | `opencode.json`  |

## How It Works

```
~/.agents/                    Single source of truth
  AGENTS.md          ──────>  ~/.codex/AGENTS.md      (symlink)
  skills/                     ~/.claude/CLAUDE.md      (symlink)
    my-skill/                 ~/.cursor/AGENTS.md      (symlink)
      SKILL.md       ──────>  ~/.codex/skills/my-skill/SKILL.md
  mcp.json           ──────>  ~/.codex/config.toml     (merged)
                              ~/.claude.json           (merged)
                              ~/.cursor/mcp.json       (symlink)
                              ~/.config/opencode/opencode.json (merged)
```

**Pipeline:** Discover assets → Collect winners → Fan out to clients → Apply (with snapshot)

- **AGENTS.md** and **skills** are symlinked when content matches the canonical source, copied when client-specific transforms are needed.
- **MCP configs** are always merge-copied — they target shared config files (Codex `config.toml`, Claude `.claude.json`, etc.) that contain other settings beyond MCP servers.
- **Nested skills** are flattened during fanout: `skills/a/b/SKILL.md` becomes `skills/a-b/SKILL.md`.
- A **snapshot** is created before every sync so you can roll back if something goes wrong.

## Commands

| Command | Description |
| ------- | ----------- |
| `link-agents sync` | Collect canonical assets and sync to all clients |
| `link-agents doctor` | Inspect sync health and detect drift |
| `link-agents restore` | Roll back to a previous snapshot |

### sync

```bash
link-agents sync                  # interactive (asks symlink vs copy)
link-agents sync --link           # prefer symlinks
link-agents sync --copy           # always copy
link-agents sync --dry-run        # preview without writing
link-agents sync --types agents   # only sync specific types (agents, skills, mcp)
link-agents sync --verbose        # show per-file details
link-agents sync --root /path     # custom root (default: $HOME)
```

`--link` and `--copy` cannot be used together. MCP configs are always merge-copied regardless of write mode.

### doctor

```bash
link-agents doctor                # check sync health
link-agents doctor --verbose      # detailed output
```

Reports: canonical asset inventory, ignored legacy inputs (e.g. `~/.cursor/rules/*`), broken symlinks, and drift between canonical and client files.

### restore

```bash
link-agents restore --list        # list available snapshots
link-agents restore --latest      # restore most recent snapshot
link-agents restore --id <id>     # restore a specific snapshot
link-agents restore --dry-run     # preview restore
```

## Write Modes

| Mode | When | Behavior |
| ---- | ---- | -------- |
| **Symlink** | Content identical to canonical source | Creates a relative symlink back to `~/.agents/*` |
| **Copy** | Client needs transformed content | Writes an independent copy with client-specific changes |
| **Merge** | MCP configs (always) | Reads existing config, merges in MCP servers, preserves other settings |

## License

MIT
