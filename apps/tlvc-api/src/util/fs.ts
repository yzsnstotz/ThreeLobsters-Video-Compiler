/**
 * File system utilities: safe paths, no path traversal.
 */

import { join, resolve, normalize } from 'path';
import * as fs from 'fs-extra';

const EP_REGEX = /^ep_[0-9]{4}$/;

export function validateEp(ep: string): boolean {
  return EP_REGEX.test(ep);
}

/**
 * Resolve path under root; reject if result is outside root (path traversal).
 */
export function resolveUnder(root: string, ...segments: string[]): string {
  const rootAbs = resolve(root);
  const full = resolve(root, ...segments);
  const normalized = normalize(full);
  if (!normalized.startsWith(rootAbs + '/') && normalized !== rootAbs) {
    throw new Error('Path traversal not allowed');
  }
  return full;
}

/**
 * Check if a zip entry name is safe (no "..", no absolute path).
 */
export function isSafeZipEntryName(name: string): boolean {
  const n = normalize(name).replace(/\\/g, '/');
  if (n.includes('..')) return false;
  if (n.startsWith('/')) return false;
  return true;
}

/**
 * Recursively find the largest .html file under dir (by size).
 */
export async function findLargestHtml(dir: string): Promise<{ path: string; size: number } | null> {
  let best: { path: string; size: number } | null = null;
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = join(current, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
        const stat = await fs.stat(full);
        if (!best || stat.size > best.size) {
          best = { path: full, size: stat.size };
        }
      }
    }
  }
  await walk(dir);
  return best;
}

export { fs };
