# AGENTS.md — sync-agents

Guidance for autonomous coding agents contributing to the `sync-agents` package.

## TL;DR

- Prefer TypeScript (NodeNext modules).
- Run `npm install` then `npm run build` before shipping changes.
- Run `npm test` to verify all tests pass.
- Default CLI mode is interactive; keep UX non-destructive.

## Project Overview

- **Purpose:** synchronize agent artifacts (AGENTS, commands, prompts, rules, skills, MCP configs) across Codex, Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Roo Code, Gemini CLI, OpenCode, VS Code, Antigravity, Goose, and the current project.
- **Entry point:** `src/index.ts` (CLI executable exported via `bin.sync-agents`).

## Key Modules

### CLI Layer

- `src/cli/options.ts` — argument parsing (commander)
- `src/cli/interactive-v2.ts` — interactive TUI flow using @clack/prompts

### Core Utils

- `src/utils/discovery.ts` — asset discovery via globbing
- `src/utils/plan.ts` — merge/source planning logic
- `src/utils/apply.ts` — file writes with backup, verification, skip-unchanged
- `src/utils/fs.ts` — filesystem utilities (read, write, symlink, backup, hash)
- `src/utils/mcp.ts` — MCP config parsing, merging, validation, secret obfuscation
- `src/utils/similarity.ts` — content similarity calculation for conflict resolution
- `src/utils/paths.ts` — path normalization and canonical path resolution
- `src/utils/validation.ts` — asset validation utilities
- `src/utils/cursorHistory.ts` — Cursor UI "Rules & Config" export helper

### Client Definitions

- `src/clients/definitions.ts` — client root paths and asset type mappings

### Types

- `src/types/index.ts` — shared TypeScript types

## Interactive Flow

The interactive mode (`npm run dev`) follows this sequence:

1. Select scope (global/project)
2. Select direction (push/pull/sync)
3. Scan all clients for assets
4. Detect & resolve conflicts (shows similarity %, modification time)
5. Select target clients (shows diff counts: +new, ~update)
6. Build sync plan
7. Review MCP servers (shows env vars with secrets obfuscated, diffs between clients)
8. Validate MCP configs (check commands exist, warn about removals)
9. Show planned changes
10. Confirm apply
11. Ask about symlinks vs copying
12. Apply with backup, skip-unchanged, and post-verification

## Workflow

1. Install deps with `npm install`.
2. Use `npm run dev` for iterative runs (`tsx`).
3. Run `npm run build` before publishing; output lives in `dist/`.
4. Run `npm test` to run vitest tests.
5. Keep new dependencies minimal and ESM-friendly.

## Style & Testing

- Strict TypeScript; avoid `any`.
- Prefer pure utilities over side effects.
- Add unit tests with `vitest` when adding planners or new merge behaviors.
- Tests live alongside source files as `*.spec.ts`.

## Safety Features

### File Operations

- Never touch directories outside defined client roots without explicit confirmation.
- Interactive mode is the safest default; `--dry-run` should work in every mode.
- `writeFileSafe` ensures directories exist before writing.
- Backup files (`.bak`) are created before overwriting existing files.
- Post-write verification ensures file was written correctly.
- Unchanged files are skipped (hash comparison).

### MCP Handling

- Secrets in env vars are auto-detected and obfuscated in display.
- Detected patterns: API keys, tokens, passwords, long alphanumeric strings.
- MCP configs are validated before apply (check for missing commands).
- Warnings shown when servers would be removed from target.
- Users can pick which version when same server has different configs across clients.

### Sync Direction

- `push`: Project -> Global clients
- `pull`: Global clients -> Project
- `sync`: Merge all and sync everywhere

### Symlinks

- `--link` flag or interactive prompt to use symlinks instead of copying.
- Symlinks keep files in sync automatically.

## Client Notes

- Claude commands are treated as Codex `prompts/*.md` during sync—Codex users must restart the CLI/IDE after syncing so slash commands reload.
- Writing to Codex's home (e.g., `~/.codex/agents` or `~/.codex/prompts`) may require elevated permissions.
- Codex uses `prompts/` for commands (not `commands/`).
- Claude Desktop only supports MCP configs (`claude_desktop_config.json`), no agents/commands/rules/skills.

## CLI Flags

| Flag                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `--dry-run`         | Show what would be done without making changes |
| `--link`            | Use symlinks instead of copying files          |
| `--verbose`         | Show detailed output                           |
| `--scope <scope>`   | `global`, `project`, or `all`                  |
| `--direction <dir>` | `push`, `pull`, or `sync`                      |
| `--source <client>` | Source client name                             |
| `--clients <names>` | Comma-separated client names                   |
| `--types <types>`   | Comma-separated asset types                    |
