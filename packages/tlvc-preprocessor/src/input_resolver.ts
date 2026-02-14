/**
 * Resolve Step2 input: file (messages.html or *.html) or export directory.
 * Directory: resolve by a priority list of candidate filenames (messages.html first; extensible).
 * Returns deterministic absolute paths for export_root and messages_html (meta).
 */

import { stat } from 'fs/promises';
import { resolve, join, basename } from 'path';

/** Priority-ordered candidate filenames for "main" HTML in an export directory. Extensible for other messengers. */
export const EXPORT_HTML_CANDIDATES = ['messages.html'] as const;

export interface ResolvedTelegramExportInput {
  kind: 'file' | 'dir';
  /** Resolved absolute path: export root (parent of main HTML for file, or the directory for dir). */
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

/**
 * Resolve input: file or directory.
 * - File: must be messages.html or *.html; exportRootDir = dirname(inputPath), messagesHtmlPath = inputPath.
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
      throw new Error(`Input file must be one of [${EXPORT_HTML_CANDIDATES.join(', ')}] or *.html, got: ${name}`);
    }
    const exportRootDir = resolve(resolvedInput, '..');
    const assets: ResolvedTelegramExportInput['assets'] = {};
    if (await dirExists(join(exportRootDir, 'photos'))) assets.photosDir = resolve(exportRootDir, 'photos');
    if (await dirExists(join(exportRootDir, 'images'))) assets.imagesDir = resolve(exportRootDir, 'images');
    if (await dirExists(join(exportRootDir, 'css'))) assets.cssDir = resolve(exportRootDir, 'css');
    if (await dirExists(join(exportRootDir, 'js'))) assets.jsDir = resolve(exportRootDir, 'js');
    return {
      kind: 'file',
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
      throw new Error(
        `Export folder must contain one of [${EXPORT_HTML_CANDIDATES.join(', ')}]: ${resolvedInput}`
      );
    }
    const assets: ResolvedTelegramExportInput['assets'] = {};
    if (await dirExists(join(resolvedInput, 'photos'))) assets.photosDir = resolve(resolvedInput, 'photos');
    if (await dirExists(join(resolvedInput, 'images'))) assets.imagesDir = resolve(resolvedInput, 'images');
    if (await dirExists(join(resolvedInput, 'css'))) assets.cssDir = resolve(resolvedInput, 'css');
    if (await dirExists(join(resolvedInput, 'js'))) assets.jsDir = resolve(resolvedInput, 'js');
    return {
      kind: 'dir',
      exportRootDir: resolvedInput,
      messagesHtmlPath,
      assets,
    };
  }

  throw new Error(`Input is neither file nor directory: ${resolvedInput}`);
}
