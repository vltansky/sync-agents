import path from "node:path";

export function validatePathSafe(root: string, targetPath: string): void {
  const normalizedRoot = path.normalize(root);
  const normalizedTarget = path.normalize(targetPath);

  const relative = path.relative(normalizedRoot, normalizedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal detected: ${targetPath} escapes root ${root}`,
    );
  }
}

export function isValidPathSafe(root: string, targetPath: string): boolean {
  try {
    validatePathSafe(root, targetPath);
    return true;
  } catch {
    return false;
  }
}
