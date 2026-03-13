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
      name: "codex",
      displayName: "Codex",
      root: path.join(HOME, ".codex"),
      assets: [
        { type: "agents", patterns: ["AGENTS.md"] },
        {
          type: "commands",
          patterns: ["prompts/**/*.md", "skills/commands/**/SKILL.md"],
        },
        { type: "rules", patterns: ["rules/**/*.rules"] },
        {
          type: "skills",
          patterns: ["skills/**/SKILL.md", "!skills/commands/**/SKILL.md"],
        },
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
      root: resolveOpenCodeRoot(),
      assets: [
        { type: "agents", patterns: ["AGENTS.md"] },
        { type: "commands", patterns: ["command/**/*.md"] },
        { type: "rules", patterns: [] },
        { type: "skills", patterns: ["skill/**/SKILL.md"] },
        { type: "mcp", patterns: [], files: ["opencode.json"] },
      ],
    },
  ];

  return defs;
}

export const CLIENT_ORDER: AgentClientName[] = [
  "codex",
  "claude",
  "cursor",
  "opencode",
];

export function clientSupportsAssetType(
  def: ClientDefinition,
  type: AssetType,
): boolean {
  const asset = def.assets.find((a) => a.type === type);
  if (!asset) return false;
  return (asset.patterns?.length ?? 0) > 0 || (asset.files?.length ?? 0) > 0;
}

function resolveOpenCodeRoot(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "opencode");
  }
  return path.join(HOME, ".config", "opencode");
}
