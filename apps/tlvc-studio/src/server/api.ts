/**
 * Studio API: profiles (index, CRUD, clone, set-default), preview, run-step2, episodes/step2.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import * as extractor from 'tlvc-extractor';
import type { ExtractorProfile } from 'tlvc-extractor';
import preprocessor from 'tlvc-preprocessor';
const { preprocessEpisode, resolveTelegramExportInput: resolveInput } = preprocessor;
import type { SegmentsTopK } from 'tlvc-schema';
import { getProfilesList, readIndex, writeIndex, syncIndex, type ProfileIndexEntry, type ProfilesIndex } from './profilesIndex.js';
import { validateProfileStrict, ensureProfileMeta } from './validateProfile.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const repoRoot = findRepoRoot();

function getProfilesDir(): string {
  return join(repoRoot, 'profiles', 'extractors');
}

function getBuildDir(): string {
  return join(repoRoot, 'build');
}

function requireToken(req: Request, res: Response): boolean {
  const token = process.env.TLVC_STUDIO_TOKEN;
  if (!token) return true;
  const header = req.headers['x-tlvc-token'];
  if (header !== token) {
    res.status(401).json({ error: 'Missing or invalid x-tlvc-token' });
    return false;
  }
  return true;
}

/** Lightweight validation for preview (no strict selector checks). */
function validateProfileBasic(profile: unknown): { ok: true } | { ok: false; error: string } {
  if (!profile || typeof profile !== 'object') return { ok: false, error: 'Invalid JSON' };
  const p = profile as Record<string, unknown>;
  if (!p.message || typeof p.message !== 'object') return { ok: false, error: 'Missing message' };
  const msg = p.message as Record<string, unknown>;
  if (typeof msg.containerSelector !== 'string') return { ok: false, error: 'Missing message.containerSelector' };
  for (const field of ['sender', 'ts', 'text']) {
    if (!p[field] || typeof p[field] !== 'object') return { ok: false, error: `Missing ${field}` };
    const cfg = p[field] as Record<string, unknown>;
    if (!Array.isArray(cfg.rules) || cfg.rules.length < 1) return { ok: false, error: `Missing or empty ${field}.rules` };
  }
  return { ok: true };
}

function slug(name: string): string {
  return name
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .toLowerCase() || 'profile';
}

function generateNewFilename(baseName: string): string {
  const s = slug(baseName);
  const ts = Date.now();
  return `${s}_${ts}.json`;
}

export const apiRouter = Router();

// GET /api/profiles — list + defaultProfile + canWriteIndex
apiRouter.get('/profiles', (_req: Request, res: Response) => {
  try {
    const dir = getProfilesDir();
    mkdirSync(dir, { recursive: true });
    const { profiles, defaultProfile, canWriteIndex } = getProfilesList(dir);
    res.json({
      profiles: profiles.map((p) => ({
        id: p.filename.replace(/\.json$/, ''),
        filename: p.filename,
        name: p.name,
        description: p.description,
        tags: p.tags ?? [],
        updatedAt: p.updatedAt,
      })),
      defaultProfile,
      canWriteIndex: !!canWriteIndex,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/profiles/:name
apiRouter.get('/profiles/:name', (req: Request, res: Response) => {
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const filepath = join(getProfilesDir(), filename);
  if (!existsSync(filepath)) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  try {
    const raw = readFileSync(filepath, 'utf-8');
    const profile = JSON.parse(raw);
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/profiles — create new (optional baseProfile to copy)
apiRouter.post('/profiles', (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const name = (req.body?.name as string)?.trim() || 'New profile';
  const baseProfile = req.body?.baseProfile as string | undefined;
  const dir = getProfilesDir();
  mkdirSync(dir, { recursive: true });
  const filename = generateNewFilename(name);
  const filepath = join(dir, filename);
  let profile: ExtractorProfile;
  if (baseProfile) {
    const baseFile = baseProfile.endsWith('.json') ? baseProfile : `${baseProfile}.json`;
    const basePath = join(dir, baseFile);
    if (!existsSync(basePath)) {
      return res.status(400).json({ error: 'baseProfile not found' });
    }
    const raw = readFileSync(basePath, 'utf-8');
    profile = JSON.parse(raw) as ExtractorProfile;
    const id = filename.replace(/\.json$/, '');
    (profile as Record<string, unknown>).meta = {
      id,
      name,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
  } else {
    profile = {
      message: { containerSelector: 'div[class*="message"]' },
      sender: { rules: [{ selector: '', value: { type: 'text' }, normalize: { trim: true } }] },
      ts: { rules: [{ selector: '', value: { type: 'attr', name: 'data-ts' }, normalize: { trim: true } }] },
      text: { rules: [{ selector: '', value: { type: 'text' }, normalize: { trim: true, collapseWhitespace: true } }] },
    };
    ensureProfileMeta(profile, filename);
    (profile.meta as Record<string, unknown>).name = name;
  }
  try {
    writeFileSync(filepath, JSON.stringify(profile, null, 2), 'utf-8');
    syncIndex(dir);
    res.status(201).json({ ok: true, filename, id: filename.replace(/\.json$/, '') });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/profiles/:name/clone
apiRouter.post('/profiles/:name/clone', (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const dir = getProfilesDir();
  const srcPath = join(dir, filename);
  if (!existsSync(srcPath)) return res.status(404).json({ error: 'Profile not found' });
  const raw = readFileSync(srcPath, 'utf-8');
  const profile = JSON.parse(raw) as ExtractorProfile;
  const newFilename = generateNewFilename((profile.meta?.name ?? name) + ' copy');
  const newPath = join(dir, newFilename);
  ensureProfileMeta(profile, newFilename);
  (profile.meta as Record<string, unknown>).name = ((profile.meta as Record<string, unknown>)?.name as string) + ' copy';
  try {
    writeFileSync(newPath, JSON.stringify(profile, null, 2), 'utf-8');
    syncIndex(dir);
    res.status(201).json({ ok: true, filename: newFilename, id: newFilename.replace(/\.json$/, '') });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/profiles/:name
apiRouter.delete('/profiles/:name', (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const dir = getProfilesDir();
  const index = readIndex(dir);
  if (index && index.defaultProfile === filename) {
    return res.status(400).json({ error: 'Cannot delete default profile. Set another as default first.' });
  }
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) return res.status(404).json({ error: 'Profile not found' });
  try {
    unlinkSync(filepath);
    if (index) syncIndex(dir);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/profiles/:name/set-default
apiRouter.post('/profiles/:name/set-default', (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const dir = getProfilesDir();
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) return res.status(404).json({ error: 'Profile not found' });
  try {
    const { profiles, defaultProfile } = getProfilesList(dir);
    const index: ProfilesIndex = {
      defaultProfile: filename,
      profiles,
    };
    writeIndex(dir, index);
    res.json({ ok: true, defaultProfile: filename });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PUT /api/profiles/:name — strong validation, auto meta, update index
apiRouter.put('/profiles/:name', (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const name = req.params.name;
  if (!name || name.includes('..') || name.includes('/')) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const body = req.body as ExtractorProfile;
  const container = (body?.message as { containerSelector?: string } | undefined)?.containerSelector ?? '';
  const validation = validateProfileStrict(body, container);
  if (!validation.ok) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }
  const dir = getProfilesDir();
  mkdirSync(dir, { recursive: true });
  const filepath = join(dir, filename);
  ensureProfileMeta(body, filename);
  try {
    writeFileSync(filepath, JSON.stringify(body, null, 2), 'utf-8');
    const index = readIndex(dir);
    if (index) {
      const entry = index.profiles.find((p) => p.filename === filename);
      const updatedAt = (body.meta as { updatedAt?: string } | undefined)?.updatedAt ?? new Date().toISOString();
      if (entry) entry.updatedAt = updatedAt;
      else index.profiles.push({ filename, name: (body.meta as { name?: string })?.name ?? filename.replace(/\.json$/, ''), updatedAt });
      writeIndex(dir, index);
    }
    res.json({ ok: true, filename, warnings: validation.warnings });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/preview — multipart: html file, profileName or profileJson (raw body for JSON)
apiRouter.post('/preview', upload.single('html'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Missing html file' });
  }
  const html = file.buffer.toString('utf-8');
  let profile: ExtractorProfile;
  const profileName = req.body.profileName as string | undefined;
  const profileJson = req.body.profileJson;
  if (profileJson) {
    try {
      const parsed = typeof profileJson === 'string' ? JSON.parse(profileJson) : profileJson;
      const v = validateProfileBasic(parsed);
      if (!v.ok) {
        return res.status(400).json({ error: v.error });
      }
      profile = parsed as ExtractorProfile;
    } catch {
      return res.status(400).json({ error: 'Invalid profileJson' });
    }
  } else if (profileName) {
    const filename = profileName.endsWith('.json') ? profileName : `${profileName}.json`;
    const filepath = join(getProfilesDir(), filename);
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    const raw = readFileSync(filepath, 'utf-8');
    profile = JSON.parse(raw) as ExtractorProfile;
  } else {
    return res.status(400).json({ error: 'Provide profileName or profileJson' });
  }
  try {
    const result = extractor.parseMessagesFromHtml(html, profile, {
      maxPreviewMessages: 200,
      includeSampleExtractions: true,
      includeExtractionDebug: true,
    });
    const stats = result.stats;
    res.json({
      messagesPreview: result.messages,
      stats: {
        totalMessages: stats.total_messages,
        senderCounts: stats.sender_distribution,
        tsMissingCount: stats.ts_missing_count,
      },
      extractionDebug: result.extractionDebug,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/resolve-input — body: inputPath? (server path); multipart: html (messages.html). Returns resolved export paths.
apiRouter.post('/resolve-input', upload.single('html'), async (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const bodyInputPath = (req.body.inputPath as string)?.trim();
  let inputPath: string;
  if (bodyInputPath) {
    inputPath = bodyInputPath;
  } else if (req.file) {
    const buildDir = getBuildDir();
    const tmpDir = join(buildDir, 'tmp', `resolve_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
    mkdirSync(tmpDir, { recursive: true });
    const htmlPath = join(tmpDir, 'messages.html');
    writeFileSync(htmlPath, req.file.buffer, 'utf-8');
    inputPath = htmlPath;
  } else {
    return res.status(400).json({ error: 'Missing inputPath or html file' });
  }
  try {
    const resolved = await resolveInput(inputPath);
    res.json({
      kind: resolved.kind,
      exportRootDir: resolved.exportRootDir,
      messagesHtmlPath: resolved.messagesHtmlPath,
      assets: resolved.assets,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// POST /api/run-step2 — body: epId, k, tz, profileName, inputPath?; multipart: html (or use inputPath)
apiRouter.post('/run-step2', upload.single('html'), async (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  const epId = req.body.epId as string;
  const k = Number(req.body.k);
  const tz = (req.body.tz as string) || 'Asia/Tokyo';
  let profileName = (req.body.profileName as string)?.trim();
  const bodyInputPath = (req.body.inputPath as string)?.trim();
  if (!epId) {
    return res.status(400).json({ error: 'Missing epId' });
  }
  let inputPath: string;
  const buildDir = getBuildDir();
  const epDir = join(buildDir, 'episodes', epId);
  const rawDir = join(epDir, 'raw');
  if (bodyInputPath) {
    inputPath = bodyInputPath;
  } else if (req.file) {
    mkdirSync(rawDir, { recursive: true });
    const htmlPath = join(rawDir, 'telegram.html');
    writeFileSync(htmlPath, req.file.buffer, 'utf-8');
    inputPath = htmlPath;
  } else {
    return res.status(400).json({ error: 'Missing inputPath (or upload html file)' });
  }
  if (Number.isNaN(k) || k < 1) {
    return res.status(400).json({ error: 'Invalid k' });
  }
  const profilesDir = getProfilesDir();
  if (!profileName) {
    const { defaultProfile } = getProfilesList(profilesDir);
    const defaultId = defaultProfile?.replace(/\.json$/, '')?.trim();
    profileName = defaultId || 'telegram_export_v1';
  }
  const outDir = epDir;
  const profilePath = profileName.includes('/') || profileName.endsWith('.json')
    ? join(repoRoot, profileName)
    : join(profilesDir, profileName.endsWith('.json') ? profileName : `${profileName}.json`);
  if (!existsSync(profilePath)) {
    return res.status(400).json({ error: 'Profile not found' });
  }
  try {
    const result = await preprocessEpisode({
      input: inputPath,
      epId,
      outDir,
      k,
      tz,
      profilePath,
    });
    const step2Dir = join(outDir, 'step2_preprocess');
    const topkPath = join(step2Dir, 'segments.topk.json');
    let top1SegmentSummary: SegmentsTopK['segments'][0] | null = null;
    if (existsSync(topkPath)) {
      const topk: SegmentsTopK = JSON.parse(readFileSync(topkPath, 'utf-8'));
      if (topk.segments?.length) {
        top1SegmentSummary = topk.segments[0];
      }
    }
    res.json({
      exitCode: result.exitCode,
      outDir: step2Dir,
      lintReport: result.lintReport,
      top1SegmentSummary,
      resolved: {
        kind: result.transcript.meta.input_kind,
        exportRootDir: result.transcript.meta.export_root,
        messagesHtmlPath: result.transcript.meta.messages_html,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/episodes/:epId/step2
apiRouter.get('/episodes/:epId/step2', (req: Request, res: Response) => {
  const epId = req.params.epId;
  if (!epId || epId.includes('..') || epId.includes('/')) {
    return res.status(400).json({ error: 'Invalid epId' });
  }
  const step2Dir = join(getBuildDir(), 'episodes', epId, 'step2_preprocess');
  const files = {
    transcript: 'sanitized.transcript.json',
    segments: 'segments.topk.json',
    lint: 'lint_report.step2.json',
  } as const;
  const out: Record<string, unknown> = {};
  for (const [key, filename] of Object.entries(files)) {
    const p = join(step2Dir, filename);
    if (existsSync(p)) {
      out[key] = JSON.parse(readFileSync(p, 'utf-8'));
    }
  }
  res.json(out);
});
