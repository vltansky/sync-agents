# RFC: Competitive Landscape Analysis — link-agents vs Ecosystem

**Status:** Draft
**Date:** 2026-03-13
**Author:** Vlad Tansky

## 1. Summary

This RFC maps the ecosystem of tools that synchronize AI coding assistant configuration (rules, skills, MCP servers, commands) across multiple agents. It identifies what competitors do better than `link-agents`, what `link-agents` already does uniquely well, and proposes concrete improvements based on evidence from real implementations.

## 2. The Landscape at a Glance

| Package | Stars | Monthly DL | Weekly DL | Clients | Approach |
|---------|-------|-----------|---------|---------|----------|
| **skills** (Vercel) | 207 | 1,310,886 | 385,065 | 40+ | Skill ecosystem/marketplace |
| **@intellectronica/ruler** | 2,545 | 50,735 | 10,069 | 35+ | `.ruler/` dir + `ruler.toml` config |
| **agents-mdx** (StackBlitz) | — | 24,729 | 5,344 | — | MDX templating → agent configs |
| **skiller** (udecode) | 17 | 5,002 | 1,250 | 30+ | Fork of ruler, `.claude/skills/` as source |
| **agents-sync** | — | 229 | 3 | 3 | Chokidar watcher, `.agents/` source |
| **sync-agents** (meistrari) | 6 | 102 | 18 | 2 | `.claude` → `.agents` → `.codex` |
| **link-agents** (this project) | — | — | — | 4 | `.agents/` canonical + bootstrap + restore |

## 3. Detailed Competitor Analysis

### 3.1 @intellectronica/ruler — The Market Leader

**Repo:** https://github.com/intellectronica/ruler (2,545 stars, 134 forks)
**npm:** `@intellectronica/ruler` (50K/month)

**What it does:**
- Stores all AI instructions in a `.ruler/` directory using Markdown files
- Distributes rules via `ruler apply` to 35+ agent config files
- Uses `ruler.toml` as a declarative config for agent selection, output paths, and MCP servers
- Supports **nested rule loading** — multiple `.ruler/` dirs for monorepo context-specific instructions
- Auto-manages `.gitignore` for generated agent config files
- Concatenates rule files with `<!-- Source: path -->` markers for traceability

**Key features link-agents lacks:**
1. **35+ agent support** vs link-agents's 4 (codex, claude, cursor, opencode). Ruler covers: Copilot, Windsurf, Cline, Aider, Firebase Studio, OpenHands, Gemini CLI, Jules, Junie, AugmentCode, Kilo Code, Goose, Crush, Amp, Zed, Qwen, Kiro, Warp, RooCode, Trae, Amazon Q, Firebender, Factory Droid, Mistral Vibe, JetBrains AI, Antigravity, Pi
2. **Nested rule loading** — `.ruler/` dirs at multiple levels for monorepo support
3. **`.gitignore` automation** — auto-adds generated files to `.gitignore`
4. **`ruler.toml` config** — declarative config for which agents to target, custom output paths
5. **Rule concatenation with source markers** — multiple `.md` files concatenated with traceability
6. **Skills syncing** — propagates skills across agents
7. **Global config** via `$XDG_CONFIG_HOME/ruler` fallback

**What link-agents does better:**
1. **Bootstrap flow** — detects existing client files and creates canonical `.agents/` from them; ruler requires manual init
2. **Restore points** — snapshots before mutation; ruler has no rollback
3. **Doctor command** — health diagnostics; ruler has no equivalent
4. **Symlink mode** — `--link` for symlinks vs always copying; ruler always writes independent copies
5. **Interactive bootstrap disambiguation** — asks which client to use as source when ambiguous

### 3.2 skiller (udecode/zbeyens) — Ruler Fork with Skills Focus

**Repo:** https://github.com/udecode/skiller (17 stars)
**npm:** `skiller` (5K/month)

**What it does:**
- Fork/evolution of ruler with `.claude/skills/` as committed source of truth
- On `apply`, skills are synced to all agents' native skill directories
- Claude Code plugins, commands, and agents synced as skills to other agents
- MCP servers defined once in `skiller.toml`, propagated to all supporting agents
- Includes migration guide from ruler

**Key differentiator:** Skills-first approach. Claude skills are the source of truth and fan out, vs ruler where `.ruler/` rules are the source. Closer to link-agents's `.agents/` canonical concept but with much broader agent support.

### 3.3 sync-agents (meistrari) — Simple Bidirectional Sync

**Repo:** https://github.com/meistrari/sync-agents (6 stars)
**npm:** `sync-agents` (102/month)

**What it does:**
- Syncs `~/.claude` ↔ `~/.agents` ↔ `~/.codex`
- Claude is source of truth, wins on conflicts
- Codex skills migrate to `.agents`, then original gets cleaned up
- Project docs: `CLAUDE.md` ↔ `AGENTS.md` — most recently modified wins
- Bun-only runtime

**Architecture:** Very simple — directory precedence: `.claude` > `.agents` > `.codex`. Additive sync only. No config files, no asset types, no granularity.

**Strengths:** Zero config, dead simple mental model.
**Weaknesses:** Only 2 real agents, Bun-only, no MCP, no commands, no skills granularity, no rollback.

### 3.4 agents-sync (mb_labs) — Watcher Mode

**npm:** `agents-sync` (229/month)

**What it does:**
- File watcher using chokidar that keeps `.agents` as shared source of truth
- Mirrors translated files into `.claude`, `.codex`, and `.gemini`
- Also mirrors `AGENTS.MD` → `CLAUDE.MD`, `GEMINI.MD`, `CODEX.MD` using translation rules
- Runs as a **persistent watcher** process, not just a one-shot CLI
- Includes `postinstall` hook for auto-setup

**Key differentiator:** **Watch mode** — live sync on file change. No other tool in the space does this. link-agents and ruler are both one-shot CLI commands.

### 3.5 agents-mdx (StackBlitz) — MDX Templating

**Repo:** stackblitz/agents.mdx (private)
**npm:** `agents-mdx` (24K/month)

**What it does:**
- Dynamic agent context hydration using MDX
- `AGENTS.mdx` → `CLAUDE.md` compiler with live data injection
- Allows templating/variables in agent instructions

**Key differentiator:** **Templating** — inject dynamic data (OKRs, metrics, build info) into agent configs at compile time. None of the other tools support this.

### 3.6 skills (Vercel/rauchg) — The Skills Ecosystem

**Repo:** https://github.com/wondelai/skills (207 stars)
**npm:** `skills` (1.3M/month — dominant)

**What it does:**
- Open agent skills ecosystem based on agentskills.io spec
- Not a sync tool — it's a **skill marketplace/registry**
- Supports 40+ AI coding agents
- Install/publish skills that work across agents

**Relevance:** Not a direct competitor to link-agents's sync model, but the 1.3M monthly downloads show that the **skills** dimension of the problem has massive traction. The agentskills.io spec is becoming a de facto standard.

## 4. Gap Analysis: What link-agents Should Learn

### 4.1 Critical Gaps (High Impact)

| Gap | Who Does It | Impact | Effort |
|-----|------------|--------|--------|
| Only 4 agents supported | Ruler (35+), Skiller (30+) | Users with Windsurf/Copilot/Aider/Gemini can't use link-agents | Medium — add client definitions |
| No `.gitignore` automation | Ruler | Generated files leak into git | Low |
| No config file (`link-agents.toml`) | Ruler (`ruler.toml`), Skiller (`skiller.toml`) | No way to customize agent selection, disable agents, set paths | Medium |
| No nested/monorepo support | Ruler (`--nested`) | Monorepo users need context-specific rules per package | High |

### 4.2 Differentiating Gaps (Medium Impact)

| Gap | Who Does It | Impact | Effort |
|-----|------------|--------|--------|
| No watch mode | agents-sync (chokidar) | Power users want live sync | Low — add chokidar |
| No templating/variables | agents-mdx (MDX) | Dynamic injection of build info/metrics | High — different paradigm |
| No skills propagation | Skiller, Ruler | Skills only sync as files, not semantically | Medium |
| No source markers in output | Ruler (`<!-- Source: -->`) | Can't trace which canonical file produced a rule | Low |

### 4.3 link-agents's Unique Strengths (Defend These)

| Feature | Competitors? | Why It Matters |
|---------|-------------|----------------|
| Bootstrap flow | None | Zero-config onboarding from existing setups |
| Restore points/snapshots | None | Safety net — undo sync damage |
| Doctor command | None | Diagnose sync health, find stale files |
| Symlink mode (`--link`) | None | Saves disk, guarantees consistency |
| Interactive bootstrap disambiguation | None | Handles ambiguous multi-client setups |
| Frontmatter parsing with client keys | None | Fine-grained per-client metadata |

## 5. Proposed Improvements (Priority Order)

### P0: Expand Agent Coverage

The single biggest gap. Ruler supports 35+ agents, link-agents supports 4. At minimum, add:

1. **Gemini CLI** — `~/.gemini/` + `AGENTS.md` + `.gemini/settings.json` (MCP)
2. **GitHub Copilot** — `AGENTS.md` + `.vscode/mcp.json`
3. **Windsurf** — `AGENTS.md` + `.windsurf/mcp_config.json`
4. **Aider** — `AGENTS.md` + `.aider.conf.yml`
5. **Cline** — `.clinerules`
6. **Amp** — `AGENTS.md`
7. **RooCode** — `AGENTS.md` + `.roo/mcp.json`
8. **Zed** — `AGENTS.md` + `.zed/settings.json`

This is mostly additive work in `src/clients/definitions.ts` — each agent is a new `ClientDefinition` entry.

### P1: `.gitignore` Automation

After sync, auto-add generated target files to `.gitignore`. Ruler does this and it's table-stakes UX. Low effort, high perceived polish.

### P2: Config File (`link-agents.toml` or `link-agents.json`)

Allow users to:
- Disable specific agents
- Override output paths
- Set default write mode (link vs copy)
- Configure which asset types to sync

```toml
[defaults]
write_mode = "link"
separate_claude_md = true

[agents.windsurf]
enabled = false

[agents.claude]
agents_path = "CLAUDE.md"
```

### P3: Watch Mode

Add `link-agents watch` — file watcher on `.agents/` that auto-syncs on change. agents-sync proves this is viable with just chokidar. Excellent DX for iterative rule development.

### P4: Source Markers in Generated Output

When writing to targets, prepend `<!-- Generated by link-agents from .agents/AGENTS.md -->`. Helps users understand which files are managed and trace back to source.

### P5: Monorepo/Nested Support

Support multiple `.agents/` directories at different levels of a monorepo. Lower priority since the current use case is home-directory global sync, but important for scaling.

## 6. Competitive Positioning

link-agents occupies a unique niche: **safe, reversible sync with smart bootstrapping**. No competitor has:
- Restore points
- Doctor diagnostics
- Bootstrap from existing setups
- Symlink mode

The recommended positioning is:

> **link-agents** — The safe way to sync AI agent configs. Bootstrap from your existing setup, sync with confidence (restore points), diagnose issues (doctor), and keep your `.agents/` canonical directory as the single source of truth.

vs Ruler's positioning of "broadest agent coverage" and skills' positioning of "skill marketplace."

## 7. Name Availability

- `link-agents` is **available** on npm (404 — not taken)
- `sync-agents` is taken (meistrari, 102/month)
- `agents-sync` is taken (mb_labs, 229/month)

## 8. Open Questions

1. Should link-agents adopt `agentskills.io` spec for skills format? (1.3M monthly DL for `skills` suggests strong momentum)
2. Should the config file be TOML (like ruler/skiller) or JSON (like existing MCP conventions)?
3. Is watch mode worth the chokidar dependency, or should it be a separate package?
4. Should we aim for ruler-level agent coverage (35+) or focus on the top 8-10 most-used agents?
5. Should link-agents publish to npm under the `link-agents` name now to claim it?

## 9. References

- **@intellectronica/ruler**: https://github.com/intellectronica/ruler
- **udecode/skiller**: https://github.com/udecode/skiller
- **meistrari/sync-agents**: https://github.com/meistrari/sync-agents
- **agents-mdx**: https://github.com/stackblitz/agents.mdx (private repo, npm: agents-mdx)
- **agents-sync**: npm: agents-sync (no public repo found)
- **skills**: https://github.com/wondelai/skills + https://agentskills.io
- **agentskills.io spec**: https://agentskills.io/specification
- **npm download data**: api.npmjs.org, collected 2026-03-13
