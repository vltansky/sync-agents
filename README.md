# link-agents

Synchronize canonical `.agents` assets across AI coding assistants.

## Quick Start

```bash
npx link-agents sync
```

This command:

1. Reads canonical assets from `.agents/`
2. Bootstraps missing canonical assets from legacy client files when possible
3. Warns about unsupported legacy inputs like `~/.cursor/rules/*`
4. Fans out canonical assets to client-specific locations
5. Creates a restore point before mutating targets

## Canonical Layout

```text
.agents/
  AGENTS.md
  commands/
  skills/
  mcp.json
```

`link-agents` treats `.agents/*` as the source of truth once those files exist.

## Commands

### `sync`

Bootstrap canonical assets if needed, then sync them to supported clients.

```bash
npx link-agents sync
npx link-agents sync --dry-run
npx link-agents sync --link
npx link-agents sync --copy
npx link-agents sync --separate-claude-md
npx link-agents sync --bootstrap-source claude
npx link-agents sync --clients claude,cursor
npx link-agents sync --types agents,mcp
```

Notes:

- `--link` prefers symlinks when target bytes can exactly reuse canonical bytes.
- `--copy` always writes independent copies.
- If neither flag is provided and the terminal is interactive, `sync` asks which write mode to use.
- `--separate-claude-md` leaves `CLAUDE.md` unmanaged for that run.
- If bootstrap is ambiguous, interactive sync asks which client to use; non-interactive sync requires `--bootstrap-source`.

### `doctor`

Inspect canonical sync health, ignored legacy inputs, broken generated targets, and canonical assets eligible for bootstrap.

```bash
npx link-agents doctor
npx link-agents doctor --verbose
```

### `restore`

Restore sync-managed targets from a snapshot.

```bash
npx link-agents restore --latest
npx link-agents restore --list
npx link-agents restore --id <snapshot-id>
npx link-agents restore --latest --dry-run
```

## Supported Clients

Public sync targets only home-directory clients. The repo-local `.agents/*` tree is canonical storage, not a public client target.

| Client    | Root                 | Agents      | Commands                         | Skills                                | MCP            |
| --------- | -------------------- | ----------- | -------------------------------- | ------------------------------------- | -------------- |
| `codex`   | `~/.codex`           | `AGENTS.md` | `skills/commands/**/SKILL.md`    | `skills/**/SKILL.md`                  | `config.toml` |
| `claude`  | `~/.claude`          | `CLAUDE.md` | `commands/**/*.md`               | —                                     | — |
| `cursor`  | `~/.cursor`          | `AGENTS.md` | `commands/**/*.md`               | —                                     | `mcp.json` |
| `opencode`| `~/.config/opencode` | `AGENTS.md` | `command/**/*.md`                | `skill/**/SKILL.md`                   | `opencode.json` |

## Behavior Notes

- `~/.cursor/rules/*` is treated as an unsupported legacy input. It is reported by `sync`/`doctor`, but never imported into canonical storage.
- `CLAUDE.md` can be left unmanaged with `--separate-claude-md`.
- Restore points are created before `sync` mutates targets.
- Generated symlinks always point back to canonical `.agents/*` sources, not to legacy client files.
- Public sync does not read from or write to legacy project-level command locations.
