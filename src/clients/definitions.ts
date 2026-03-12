import path from "node:path";
import os from "node:os";
import type {
  AgentClientName,
  AssetType,
  ClientDefinition,
} from "../types/index.js";

const HOME = os.homedir();

export function buildClientDefinitions(
  projectRoot: string,
): ClientDefinition[] {
  const defs: ClientDefinition[] = [
    {
      name: "project",
      displayName: "Project",
      root: projectRoot,
      assets: [
        { type: "agents", patterns: ["AGENTS.md", "CLAUDE.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        {
          type: "rules",
          patterns: ["rules/**/*.md", "rules/**/*.mdc", "rules/**/*.rules"],
        },
        { type: "skills", patterns: ["skills/**"] },
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
        { type: "agents", patterns: ["CLAUDE.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        { type: "rules", patterns: [] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: [] },
      ],
    },
    {
      name: "cursor",
      displayName: "Cursor",
      root: path.join(HOME, ".cursor"),
      assets: [
        { type: "agents", patterns: ["AGENTS.md"] },
        { type: "commands", patterns: ["commands/**/*.md"] },
        { type: "rules", patterns: ["rules/**/*.md", "rules/**/*.mdc"] },
        { type: "skills", patterns: [] },
        { type: "mcp", patterns: [], files: ["mcp.json"] },
      ],
    },
    {
      name: "opencode",
      displayName: "OpenCode",
      // OpenCode uses XDG config dir: ~/.config/opencode/
      root: resolveOpenCodeRoot(),
      assets: [
        // OpenCode uses AGENTS.md for rules/instructions
        // See: https://opencode.ai/docs/rules/
        { type: "agents", patterns: ["AGENTS.md"] },
        // OpenCode uses singular: command/ (not commands/)
        // See: https://opencode.ai/docs/commands/
        { type: "commands", patterns: ["command/**/*.md"] },
        // OpenCode rules are in AGENTS.md, not separate files
        { type: "rules", patterns: [] },
        // OpenCode uses singular: skill/ (not skills/)
        // See: https://opencode.ai/docs/skills/
        { type: "skills", patterns: ["skill/**/SKILL.md"] },
        // MCP servers are configured in opencode.json under "mcp" key
        // See: https://opencode.ai/docs/mcp-servers/
        { type: "mcp", patterns: [], files: ["opencode.json"] },
      ],
    },
  ];

  return defs;
}

export const CLIENT_ORDER: AgentClientName[] = [
  "project",
  "codex",
  "claude",
  "cursor",
  "opencode",
];

/**
 * Check if a client supports a specific asset type.
 * A client supports an asset type if it has non-empty patterns or files for that type.
 */
export function clientSupportsAssetType(
  def: ClientDefinition,
  type: AssetType,
): boolean {
  const asset = def.assets.find((a) => a.type === type);
  if (!asset) return false;
  // Has patterns or files defined
  return (asset.patterns?.length ?? 0) > 0 || (asset.files?.length ?? 0) > 0;
}

function resolveOpenCodeRoot(): string {
  // OpenCode follows XDG Base Directory spec
  // Uses $XDG_CONFIG_HOME/opencode or ~/.config/opencode
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "opencode");
  }
  return path.join(HOME, ".config", "opencode");
}
