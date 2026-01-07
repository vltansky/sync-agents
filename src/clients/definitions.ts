import path from "node:path";
import os from "node:os";
import type { AgentClientName, ClientDefinition } from "../types/index.js";

const HOME = os.homedir();

const DEFAULT_PATTERNS = {
  agents: ["AGENTS.md", "CLAUDE.md"],
  commands: ["commands/**/*.md"],
  rules: ["rules/**/*.md", "rules/**/*.mdc", "rules/**/*.rules"],
  skills: ["skills/**"],
  prompts: ["prompts/**/*.md"],
};

export function buildClientDefinitions(
  projectRoot: string,
): ClientDefinition[] {
  const defs: ClientDefinition[] = [
    {
      name: "project",
      displayName: "Project",
      root: projectRoot,
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: [".cursor/mcp.json", ".mcp.json"] },
      ],
    },
    {
      name: "codex",
      displayName: "Codex",
      root: path.join(HOME, ".codex"),
      assets: [
        { type: "agents", patterns: ["AGENTS.md"] },
        // Codex uses prompts/ for slash commands (not commands/)
        { type: "commands", patterns: ["prompts/**/*.md"] },
        { type: "rules", patterns: ["rules/**/*.rules"] },
        { type: "skills", patterns: ["skills/**/SKILL.md"] },
        { type: "mcp", patterns: [], files: ["config.toml"] },
      ],
    },
    {
      name: "claude",
      displayName: "Claude Code",
      root: path.join(HOME, ".claude"),
      assets: [
        { type: "agents", patterns: ["agents/**/*.md", "CLAUDE.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        { type: "rules", patterns: ["rules/**/*.md"] },
        { type: "skills", patterns: ["skills/**/SKILL.md"] },
        { type: "mcp", patterns: [], files: [] },
      ],
    },
    {
      name: "claudeDesktop",
      displayName: "Claude Desktop",
      root: resolveClaudeDesktopRoot(),
      assets: [
        { type: "agents", patterns: [] },
        { type: "commands", patterns: [] },
        { type: "rules", patterns: [] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: ["claude_desktop_config.json"] },
      ],
    },
    {
      name: "cursor",
      displayName: "Cursor",
      root: path.join(HOME, ".cursor"),
      assets: [
        { type: "agents", patterns: ["AGENTS.md", "agents/**/*.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        { type: "rules", patterns: ["rules/**/*.md", "rules/**/*.mdc"] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: ["mcp.json"] },
      ],
    },
    {
      name: "opencode",
      displayName: "OpenCode",
      root: path.join(HOME, ".opencode"),
      assets: [
        { type: "agents", patterns: ["AGENTS.md", "agents/**/*.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        { type: "rules", patterns: ["rules/**/*.md"] },
        { type: "skills", patterns: ["skills/**/SKILL.md"] },
        { type: "mcp", patterns: [], files: ["opencode.jsonc", "config.json"] },
      ],
    },
    {
      name: "windsurf",
      displayName: "Windsurf",
      root: path.join(HOME, ".codeium", "windsurf"),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: ["mcp_config.json"] },
      ],
    },
    {
      name: "cline",
      displayName: "Cline",
      root: path.join(HOME, ".cline"),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: ["mcp.json"] },
      ],
    },
    {
      name: "roo",
      displayName: "Roo Code",
      root: path.join(HOME, ".roo"),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: ["mcp.json"] },
      ],
    },
    {
      name: "gemini",
      displayName: "Gemini CLI",
      root: path.join(HOME, ".gemini"),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: [] },
      ],
    },
    {
      name: "vscode",
      displayName: "VS Code",
      root: resolveVsCodeUserDir(),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: [] },
      ],
    },
    {
      name: "antigravity",
      displayName: "Antigravity",
      root: resolveAntigravityUserDir(),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: [] },
      ],
    },
    {
      name: "goose",
      displayName: "Goose",
      root: resolveGooseRoot(),
      assets: [
        { type: "agents", patterns: DEFAULT_PATTERNS.agents },
        { type: "commands", patterns: DEFAULT_PATTERNS.commands },
        { type: "rules", patterns: DEFAULT_PATTERNS.rules },
        { type: "skills", patterns: DEFAULT_PATTERNS.skills },
        { type: "mcp", patterns: [], files: ["config.yaml", "config.yml"] },
      ],
    },
    {
      name: "mcphub",
      displayName: "MCPHub",
      root: path.join(HOME, ".config", "mcphub"),
      assets: [
        { type: "agents", patterns: [] },
        { type: "commands", patterns: [] },
        { type: "rules", patterns: [] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: ["servers.json"] },
      ],
    },
    {
      name: "cherrystudio",
      displayName: "CherryStudio",
      root: path.join(HOME, ".config", "cherrystudio"),
      assets: [
        { type: "agents", patterns: [] },
        { type: "commands", patterns: [] },
        { type: "rules", patterns: [] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: ["mcp.json"] },
      ],
    },
  ];

  return defs;
}

export const CLIENT_ORDER: AgentClientName[] = [
  "project",
  "codex",
  "claude",
  "claudeDesktop",
  "cursor",
  "windsurf",
  "cline",
  "roo",
  "gemini",
  "opencode",
  "vscode",
  "antigravity",
  "goose",
  "mcphub",
  "cherrystudio",
];

function resolveVsCodeUserDir(): string {
  if (process.platform === "darwin") {
    return path.join(HOME, "Library", "Application Support", "Code", "User");
  }
  if (process.platform === "win32") {
    const roaming =
      process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
    return path.join(roaming, "Code", "User");
  }
  return path.join(HOME, ".config", "Code", "User");
}

function resolveAntigravityUserDir(): string {
  if (process.platform === "darwin") {
    return path.join(
      HOME,
      "Library",
      "Application Support",
      "Antigravity",
      "User",
    );
  }
  if (process.platform === "win32") {
    const roaming =
      process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
    return path.join(roaming, "Antigravity", "User");
  }
  return path.join(HOME, ".config", "Antigravity", "User");
}

function resolveGooseRoot(): string {
  if (process.platform === "win32") {
    const profile = process.env.USERPROFILE || HOME;
    return path.join(profile, ".config", "goose");
  }
  return path.join(HOME, ".config", "goose");
}

function resolveClaudeDesktopRoot(): string {
  if (process.platform === "darwin") {
    return path.join(HOME, "Library", "Application Support", "Claude");
  }
  if (process.platform === "win32") {
    const roaming =
      process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
    return path.join(roaming, "Claude");
  }
  return path.join(HOME, ".config", "Claude");
}
