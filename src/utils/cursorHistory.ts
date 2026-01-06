import path from 'node:path';
import fg from 'fast-glob';
import chalk from 'chalk';
import { fileExists, readFileSafe, writeFileSafe, expandHome } from './fs.js';
import { getCursorHistoryRoot, defaultCursorHistoryExportPath } from './cursorPaths.js';
import { normalizeRelativePath } from './paths.js';

interface ExportOptions {
  destination?: string;
  verbose?: boolean;
}

export async function exportCursorHistory(options: ExportOptions = {}): Promise<void> {
  const historyRoot = getCursorHistoryRoot();
  const exists = await fileExists(historyRoot);
  if (!exists) {
    if (options.verbose) {
      console.log(chalk.gray('No Cursor history directory found, skipping export.'));
    }
    return;
  }

  const files = await fg(['**/*.md'], {
    cwd: historyRoot,
    dot: true,
    onlyFiles: true,
    unique: true,
  });

  if (files.length === 0) {
    if (options.verbose) {
      console.log(chalk.gray('No Cursor history markdown files detected.'));
    }
    return;
  }

  const sections: string[] = [];
  for (const rel of files.sort()) {
    const abs = path.join(historyRoot, rel);
    const content = await readFileSafe(abs);
    if (content === null) {
      continue;
    }
    sections.push(`## ${normalizeRelativePath(rel)}\n\n${content.trim()}`);
  }

  if (sections.length === 0) {
    if (options.verbose) {
      console.log(chalk.gray('No readable Cursor history files found.'));
    }
    return;
  }

  const destination = resolveDestinationPath(options.destination ?? defaultCursorHistoryExportPath());
  await writeFileSafe(destination, `${sections.join('\n\n---\n\n')}\n`);

  console.log(chalk.green(`Cursor history exported to ${destination}`));
}

function resolveDestinationPath(inputPath: string): string {
  const expanded = expandHome(inputPath);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.join(process.cwd(), expanded);
}
