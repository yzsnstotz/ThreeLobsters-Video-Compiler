/**
 * Resolve Step2 input: file (messages.html or any .html) or export directory.
 * Directory: resolve by priority: messages.html then messagesX.html (dict order) then any .html with div.message (shallow first).
 * Returns deterministic absolute paths for export_root and messages_html (meta).
 */

import { stat } from 'fs/promises';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';

/** Priority-ordered candidate filenames for "main" HTML in an export directory. Extensible for other messengers. */
export const EXPORT_HTML_CANDIDATES = ['messages.html'] as const;

export interface ResolvedTelegramExportInput {
  kind: 'file' | 'dir';
  /** Original input path (resolved to absolute). Used for meta.source.input_path. */
  input_path: string;
  /** Resolved absolute path: export root (parent of main HTML for file, or the directory for dir). Same as assets_dir. */
  exportRootDir: string;
  /** Resolved absolute path to the main HTML file (matched candidate in dir, or the file path). */
  messagesHtmlPath: string;
  assets: {
    photosDir?: string;
    imagesDir?: string;
    cssDir?: string;
    jsDir?: string;
  };
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Check if file content contains a node matching selector (e.g. div.message). Uses simple string search for speed. */
function htmlContainsSelector(filePath: string, selectorHint: string): boolean {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    if (selectorHint === 'div.message') {
      return /<div[^>]*class="[^"]*message[^"]*"/i.test(raw);
    }
    return raw.includes(selectorHint);
  } catch {
    return false;
  }
}

/** Find first HTML under dir that contains div.message. Shallow first: top-level .html then one level down. */
function findHtmlWithMessageBlock(dir: string): string | null {
  const hint = 'div.message';
  try {
    const topEntries = readdirSync(dir, { withFileTypes: true });
    const topFiles = topEntries
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.html'))
      .map((d) => join(dir, d.name))
      .sort();
    for (const p of topFiles) {
      if (htmlContainsSelector(p, hint)) return resolve(p);
    }
    const subDirs = topEntries
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => join(dir, d.name))
      .sort();
    for (const sub of subDirs) {
      const subEntries = readdirSync(sub, { withFileTypes: true });
      const subFiles = subEntries
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.html'))
        .map((d) => join(sub, d.name))
        .sort();
      for (const p of subFiles) {
        if (htmlContainsSelector(p, hint)) return resolve(p);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Resolve input: file or directory.
 * - File: must be messages.html or any .html; exportRootDir = dirname(inputPath), messagesHtmlPath = inputPath.
 * - Dir: try EXPORT_HTML_CANDIDATES in order; first existing file wins. If none found: throw (runtime exit 1). Meta: export_root + messages_html.
 */
export async function resolveTelegramExportInput(
  inputPath: string
): Promise<ResolvedTelegramExportInput> {
  const resolvedInput = resolve(inputPath);

  let statResult: { isFile: boolean; isDir: boolean };
  try {
    const s = await stat(resolvedInput);
    statResult = { isFile: s.isFile(), isDir: s.isDirectory() };
  } catch {
    throw new Error(`Input not found: ${resolvedInput}`);
  }

  if (statResult.isFile) {
    const name = basename(resolvedInput);
    const isCandidate = (EXPORT_HTML_CANDIDATES as readonly string[]).includes(name);
    if (!isCandidate && !name.toLowerCase().endsWith('.html')) {
      throw new Error(`Input file must be one of [${EXPORT_HTML_CANDIDATES.join(', ')}] or any .html, got: ${name}`);
    }
    const exportRootDir = resolve(resolvedInput, '..');
    const assets: ResolvedTelegramExportInput['assets'] = {};
    if (await dirExists(join(exportRootDir, 'photos'))) assets.photosDir = resolve(exportRootDir, 'photos');
    if (await dirExists(join(exportRootDir, 'images'))) assets.imagesDir = resolve(exportRootDir, 'images');
    if (await dirExists(join(exportRootDir, 'css'))) assets.cssDir = resolve(exportRootDir, 'css');
    if (await dirExists(join(exportRootDir, 'js'))) assets.jsDir = resolve(exportRootDir, 'js');
    return {
      kind: 'file',
      input_path: resolvedInput,
      exportRootDir,
      messagesHtmlPath: resolvedInput,
      assets,
    };
  }

  if (statResult.isDir) {
    let messagesHtmlPath: string | null = null;
    for (const candidate of EXPORT_HTML_CANDIDATES) {
      const p = join(resolvedInput, candidate);
      if (await fileExists(p)) {
        messagesHtmlPath = resolve(p);
        break;
      }
    }
    if (messagesHtmlPath == null) {
      const dirEntries = readdirSync(resolvedInput, { withFileTypes: true });
      const messagesGlob = dirEntries
        .filter((d) => d.isFile() && d.name.toLowerCase().startsWith('messages') && d.name.toLowerCase().endsWith('.html'))
        .map((d) => join(resolvedInput, d.name))
        .sort();
      if (messagesGlob.length > 0) {
        messagesHtmlPath = resolve(messagesGlob[0]);
      }
    }
    if (messagesHtmlPath == null) {
      const found = findHtmlWithMessageBlock(resolvedInput);
      if (found) messagesHtmlPath = found;
    }
    if (messagesHtmlPath == null) {
      throw new Error(
        `Export folder must contain messages.html, messagesX.html, or any .html with div.message: ${resolvedInput}`
      );
    }
    const assets: ResolvedTelegramExportInput['assets'] = {};
    if (await dirExists(join(resolvedInput, 'photos'))) assets.photosDir = resolve(resolvedInput, 'photos');
    if (await dirExists(join(resolvedInput, 'images'))) assets.imagesDir = resolve(resolvedInput, 'images');
    if (await dirExists(join(resolvedInput, 'css'))) assets.cssDir = resolve(resolvedInput, 'css');
    if (await dirExists(join(resolvedInput, 'js'))) assets.jsDir = resolve(resolvedInput, 'js');
    return {
      kind: 'dir',
      input_path: resolvedInput,
      exportRootDir: resolvedInput,
      messagesHtmlPath,
      assets,
    };
  }

  throw new Error(`Input is neither file nor directory: ${resolvedInput}`);
}
