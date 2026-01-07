import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readFileSafe } from "./fs.js";

const GITIGNORE_MARKER_START = "# sync-agents generated files";
const GITIGNORE_MARKER_END = "# end sync-agents";

/**
 * Update .gitignore to include sync-agents generated files.
 * Only updates if there are project-level generated files.
 */
export async function updateGitignore(
  projectRoot: string,
  generatedPaths: string[],
): Promise<boolean> {
  // Only include paths relative to project root
  const relativePaths = generatedPaths
    .filter((p) => p.startsWith(projectRoot))
    .map((p) => path.relative(projectRoot, p))
    .filter((p) => p && !p.startsWith(".."));

  if (relativePaths.length === 0) {
    return false;
  }

  const gitignorePath = path.join(projectRoot, ".gitignore");
  let content = (await readFileSafe(gitignorePath)) ?? "";

  // Remove existing sync-agents section
  const startIdx = content.indexOf(GITIGNORE_MARKER_START);
  const endIdx = content.indexOf(GITIGNORE_MARKER_END);
  if (startIdx !== -1 && endIdx !== -1) {
    content =
      content.slice(0, startIdx) +
      content.slice(endIdx + GITIGNORE_MARKER_END.length);
  }

  // Build new section
  const newSection = [
    "",
    GITIGNORE_MARKER_START,
    ...relativePaths.map((p) => `/${p}`),
    GITIGNORE_MARKER_END,
    "",
  ].join("\n");

  // Append to content
  content = content.trimEnd() + newSection;

  await fs.writeFile(gitignorePath, content, "utf8");
  return true;
}

/**
 * Remove sync-agents section from .gitignore.
 */
export async function cleanGitignore(projectRoot: string): Promise<boolean> {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  if (!(await fileExists(gitignorePath))) {
    return false;
  }

  let content = (await readFileSafe(gitignorePath)) ?? "";
  const startIdx = content.indexOf(GITIGNORE_MARKER_START);
  const endIdx = content.indexOf(GITIGNORE_MARKER_END);

  if (startIdx === -1 || endIdx === -1) {
    return false;
  }

  content =
    content.slice(0, startIdx) +
    content.slice(endIdx + GITIGNORE_MARKER_END.length);
  content = content.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  await fs.writeFile(gitignorePath, content, "utf8");
  return true;
}
