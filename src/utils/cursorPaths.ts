import path from "node:path";
import os from "node:os";

const HOME = os.homedir();

export function getCursorHistoryRoot(): string {
  if (process.platform === "darwin") {
    return path.join(
      HOME,
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "History",
    );
  }
  if (process.platform === "win32") {
    const roaming =
      process.env.APPDATA || path.join(HOME, "AppData", "Roaming");
    return path.join(roaming, "Cursor", "User", "History");
  }
  return path.join(HOME, ".config", "Cursor", "User", "History");
}

export function defaultCursorHistoryExportPath(): string {
  return path.join(HOME, ".cursor", "AGENTS.md");
}
