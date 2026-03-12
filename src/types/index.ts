export type AgentClientName =
  | "project"
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

export type ManagedAssetType = "agents" | "commands" | "skills" | "mcp";

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
  reset?: boolean;
  revert?: boolean;
  revertList?: boolean;
  link?: boolean;
  separateClaudeMd?: boolean;
}

export interface SyncCommandOptions {
  command: "sync";
  clients?: AgentClientName[];
  types?: ManagedAssetType[];
  dryRun: boolean;
  verbose: boolean;
  link: boolean;
  copy: boolean;
  separateClaudeMd: boolean;
  bootstrapSource?: AgentClientName;
}

export interface DoctorCommandOptions {
  command: "doctor";
  clients?: AgentClientName[];
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

export interface ScanResult {
  client: AgentClientName;
  displayName: string;
  found: boolean;
  assets: AssetContent[];
  root: string;
}
