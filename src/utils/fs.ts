import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function writeFileSafe(filePath: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

export function hashContent(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}

export function expandHome(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return path.join(process.env.HOME ?? '', inputPath.slice(1));
  }
  return inputPath;
}

export function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}
