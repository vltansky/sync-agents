export type AgentClientName =
  | "project"
  | "codex"
  | "claude"
  | "cursor"
  | "opencode"
  | "windsurf"
  | "cline"
  | "roo"
  | "gemini"
  | "vscode"
  | "antigravity"
  | "goose";

export type AssetType =
  | "agents"
  | "commands"
  | "rules"
  | "skills"
  | "mcp"
  | "prompts";

export type SyncScope = "project" | "global" | "all";
export type SyncDirection = "push" | "pull" | "sync";
export type ConflictResolution =
  | "source"
  | "target"
  | "merge"
  | "rename"
  | "skip";

export interface AssetLocation {
  path: string;
  name: string;
  type: AssetType;
  client: AgentClientName;
  relativePath: string;
  canonicalPath?: string;
}

export interface AssetContent extends AssetLocation {
  content: string;
  hash: string;
  metadata?: Record<string, unknown>;
  modifiedAt?: Date;
}

export interface ClientDefinition {
  name: AgentClientName;
  displayName: string;
  root: string;
  assets: AssetPattern[];
}

export interface AssetPattern {
  type: AssetType;
  patterns: string[];
  files?: string[];
}

export interface SyncOptions {
  mode: "interactive" | "merge" | "source";
  scope?: SyncScope;
  direction?: SyncDirection;
  source?: AgentClientName;
  clients?: AgentClientName[];
  types?: AssetType[];
  dryRun?: boolean;
  verbose?: boolean;
  priority?: AgentClientName[];
  exportCursorHistory?: boolean;
  cursorHistoryDest?: string;
}

export interface SyncPlanEntry {
  asset: AssetContent;
  targetClient: AgentClientName;
  targetPath: string;
  targetRelativePath?: string;
  action: "create" | "update" | "skip";
  reason?: string;
}

export interface AssetConflict {
  canonicalKey: string;
  type: AssetType;
  versions: AssetContent[];
  resolution?: ConflictResolution;
  resolvedContent?: string;
  renamedPath?: string;
  selectedVersion?: AssetContent;
}

export interface ScanResult {
  client: AgentClientName;
  displayName: string;
  found: boolean;
  assets: AssetContent[];
  root: string;
}
