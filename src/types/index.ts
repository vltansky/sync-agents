export type AgentClientName =
  | "canonical"
  | "codex"
  | "claude"
  | "cursor"
  | "opencode";

export type AssetType =
  | "agents"
  | "commands"
  | "rules"
  | "skills"
  | "mcp"
  | "prompts";

export type ManagedAssetType = "agents" | "skills" | "mcp";

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
  /** When set, read this JSON key from the file instead of the whole file */
  jsonKey?: string;
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
  reset?: boolean;
  revert?: boolean;
  revertList?: boolean;
  link?: boolean;
}

export interface SyncCommandOptions {
  command: "sync";
  root: string;
  types?: ManagedAssetType[];
  dryRun: boolean;
  verbose: boolean;
  link: boolean;
  copy: boolean;
}

export interface DoctorCommandOptions {
  command: "doctor";
  root: string;
  types?: ManagedAssetType[];
  verbose: boolean;
}

export interface RestoreCommandOptions {
  command: "restore";
  latest: boolean;
  list: boolean;
  id?: string;
  dryRun: boolean;
  verbose: boolean;
}

export type CliCommandOptions =
  | SyncCommandOptions
  | DoctorCommandOptions
  | RestoreCommandOptions;

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

export interface AppliedEntry {
  targetClient: string;
  assetType: string;
  writeMode: "symlink" | "copy";
  mcpServerCount?: number;
}

export interface ScanResult {
  client: AgentClientName;
  displayName: string;
  found: boolean;
  assets: AssetContent[];
  root: string;
}
