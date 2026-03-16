import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentClientName, ManagedAssetType } from "../types/index.js";

const STATE_PATH = path.join(
  os.homedir(),
  ".link-agents",
  "canonical-state.json",
);

export interface GeneratedStateEntry {
  path: string;
  sourcePath: string;
  canonicalPath: string;
  targetClient: AgentClientName;
  type: ManagedAssetType;
  mode: "copy" | "symlink";
  expectedContent?: string;
}

interface CanonicalState {
  version: 1;
  updatedAt: string;
  generated: GeneratedStateEntry[];
}

export async function readCanonicalState(): Promise<CanonicalState> {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, "utf8")) as CanonicalState;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      // File exists but is corrupt or unreadable — warn so the user
      // knows stale-file detection may be unreliable.
      console.warn(
        `Warning: cannot read canonical state (${code ?? (err as Error).message}), stale-file detection may be incomplete`,
      );
    }
    return { version: 1, updatedAt: new Date(0).toISOString(), generated: [] };
  }
}

export async function writeCanonicalState(
  entries: GeneratedStateEntry[],
): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(
    STATE_PATH,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        generated: entries,
      } satisfies CanonicalState,
      null,
      2,
    ),
    "utf8",
  );
}
