# AGENTS.md — sync-agents

Guidance for autonomous coding agents contributing to the `sync-agents` package.

## TL;DR
- Prefer TypeScript (NodeNext modules).
- Run `npm install` then `npm run build` before shipping changes.
- Default CLI mode is interactive; keep UX non-destructive.

## Project Overview
- **Purpose:** synchronize agent artifacts (AGENTS, commands, prompts, rules, skills, MCP configs) across Codex, Claude Code, Cursor, Windsurf, Cline, Roo Code, Gemini CLI, OpenCode, VS Code, Antigravity, Goose, and the current project.
- **Entry point:** `src/index.ts` (CLI executable exported via `bin.sync-agents`).
- **Key modules:**
  - `src/cli/options.ts` — argument parsing (commander)
  - `src/utils/discovery.ts` — asset discovery via globbing
  - `src/utils/plan.ts` — merge/source planning logic
  - `src/utils/apply.ts` — file writes (+ dry-run support)
  - `src/utils/cursorHistory.ts` — Cursor UI “Rules & Config” export helper

## Workflow
1. Install deps with `npm install`.
2. Use `npm run dev` for iterative runs (`tsx`).
3. Run `npm run build` before publishing; output lives in `dist/`.
4. Keep new dependencies minimal and ESM-friendly.

## Style & Testing
- Strict TypeScript; avoid `any`.
- Prefer pure utilities over side effects.
- Add unit tests with `vitest` when adding planners or new merge behaviors.

## Safety
- Never touch directories outside defined client roots without explicit confirmation.
- Interactive mode must be the safest default; `--dry-run` should work in every mode.
- When editing file operations, preserve `writeFileSafe` to ensure directories exist before writing.
- Claude commands are treated as Codex `prompts/*.md` during sync—Codex users must restart the CLI/IDE after syncing so slash commands reload.
- Writing to Codex’s home (for example `~/.codex/agents` or `~/.codex/prompts`) may require elevated permissions; run the CLI from a context that can create files there or change ownership first.
