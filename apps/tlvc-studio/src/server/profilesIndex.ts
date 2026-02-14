/**
 * profiles/extractors/index.json: defaultProfile + profiles list.
 * If missing, we scan the directory and return canWriteIndex=true.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

export interface ProfileIndexEntry {
  filename: string;
  name: string;
  description?: string;
  tags?: string[];
  updatedAt: string;
}

export interface ProfilesIndex {
  defaultProfile: string;
  profiles: ProfileIndexEntry[];
}

const INDEX_FILENAME = 'index.json';

function getIndexPath(profilesDir: string): string {
  return join(profilesDir, INDEX_FILENAME);
}

export function readIndex(profilesDir: string): ProfilesIndex | null {
  const path = getIndexPath(profilesDir);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ProfilesIndex;
  } catch {
    return null;
  }
}

export function writeIndex(profilesDir: string, index: ProfilesIndex): void {
  writeFileSync(getIndexPath(profilesDir), JSON.stringify(index, null, 2), 'utf-8');
}

export function scanProfilesDir(profilesDir: string): ProfileIndexEntry[] {
  if (!existsSync(profilesDir)) return [];
  const files = readdirSync(profilesDir).filter((f) => f.endsWith('.json') && f !== INDEX_FILENAME);
  const entries: ProfileIndexEntry[] = [];
  for (const filename of files) {
    const filepath = join(profilesDir, filename);
    const stat = statSync(filepath);
    let name = filename.replace(/\.json$/, '');
    try {
      const raw = readFileSync(filepath, 'utf-8');
      const p = JSON.parse(raw) as { meta?: { name?: string } };
      if (p?.meta?.name) name = p.meta.name;
    } catch {
      /* ignore */
    }
    entries.push({
      filename,
      name,
      updatedAt: stat.mtime.toISOString(),
    });
  }
  return entries.sort((a, b) => a.filename.localeCompare(b.filename));
}

/** Get list + default. If no index, scan and set canWriteIndex. */
export function getProfilesList(profilesDir: string): {
  profiles: ProfileIndexEntry[];
  defaultProfile: string;
  canWriteIndex: boolean;
} {
  const index = readIndex(profilesDir);
  const scanned = scanProfilesDir(profilesDir);
  const filenames = new Set(scanned.map((e) => e.filename));

  if (index) {
    const merged = scanned.slice();
    const byFile = new Map(merged.map((e) => [e.filename, e]));
    for (const e of index.profiles) {
      if (filenames.has(e.filename) && !byFile.has(e.filename)) {
        merged.push(e);
      } else if (byFile.has(e.filename)) {
        const existing = byFile.get(e.filename)!;
        if (e.name) existing.name = e.name;
        if (e.description != null) existing.description = e.description;
        if (e.tags != null) existing.tags = e.tags;
        if (e.updatedAt) existing.updatedAt = e.updatedAt;
      }
    }
    let defaultProfile = index.defaultProfile;
    if (!filenames.has(defaultProfile) && merged.length > 0) {
      defaultProfile = merged[0].filename;
    }
    return { profiles: merged, defaultProfile, canWriteIndex: true };
  }

  const defaultProfile = scanned.length > 0 ? scanned[0].filename : '';
  return { profiles: scanned, defaultProfile, canWriteIndex: true };
}

/** Sync index from current directory; fix missing entries. */
export function syncIndex(profilesDir: string): ProfilesIndex {
  const scanned = scanProfilesDir(profilesDir);
  const existing = readIndex(profilesDir);
  let defaultProfile = existing?.defaultProfile ?? '';
  if (!scanned.some((e) => e.filename === defaultProfile) && scanned.length > 0) {
    defaultProfile = scanned[0].filename;
  }
  const index: ProfilesIndex = {
    defaultProfile,
    profiles: scanned,
  };
  writeIndex(profilesDir, index);
  return index;
}
