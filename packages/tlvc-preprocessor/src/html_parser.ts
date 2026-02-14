/**
 * HTML → messages[]. Profile-driven; two-phase ts (attr title else time+date) to achieve 0 TS_PARSE_MISSING.
 * Containers matching ignoreSelectors are skipped. Messages without ts are dropped. Attachments parsed per message.
 */

import type { TranscriptMessage, TranscriptAttachment, AttachmentKind } from 'tlvc-schema';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative } from 'path';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Element } from 'cheerio';
import type { ExtractorProfile, ExtractorRule } from 'tlvc-extractor';
import { normalizeSender } from 'tlvc-extractor';
import { parseTelegramTitleTs, parseDateSeparatorToDDMMYYYY, buildFullTsFromDateAndTime } from './ts_parse';

const DEFAULT_PROFILE_PATH = 'profiles/extractors/telegram_export_v1.json';
const DEFAULT_CONTAINER_SELECTOR = 'div.message.default';
const TS_ATTR_SELECTOR = 'div.pull_right.date.details';
const DATE_SEPARATOR_SELECTOR = '[class*="message_date"]';

const ATTACHMENT_PATH_PATTERNS: Array<{ pattern: RegExp; kind: AttachmentKind }> = [
  { pattern: /^(?:\.\/)?photos\//i, kind: 'photo' },
  { pattern: /^(?:\.\/)?(?:video_files|videos?)\//i, kind: 'video' },
  { pattern: /^(?:\.\/)?files\//i, kind: 'file' },
  { pattern: /^(?:\.\/)?stickers\//i, kind: 'sticker' },
  { pattern: /^(?:\.\/)?voice_messages\//i, kind: 'voice' },
];

function loadProfile(profilePath: string): ExtractorProfile {
  const resolved = resolve(process.cwd(), profilePath);
  if (!existsSync(resolved)) {
    throw new Error(`Profile not found: ${resolved}`);
  }
  const raw = readFileSync(resolved, 'utf-8');
  const profile = JSON.parse(raw) as ExtractorProfile;
  if (!profile?.message || !profile.sender?.rules || !profile.ts?.rules || !profile.text?.rules) {
    throw new Error(`Invalid profile: missing required fields (message, sender.rules, ts.rules, text.rules)`);
  }
  if (!profile.message.containerSelector?.trim()) {
    profile.message = { ...profile.message, containerSelector: DEFAULT_CONTAINER_SELECTOR };
  }
  return profile;
}

function extractWithRule($: CheerioAPI, $container: cheerio.Cheerio<Element>, rule: ExtractorRule): string | null {
  const el = $container.find(rule.selector).first();
  if (el.length === 0) return null;
  const v = rule.value;
  let raw: string;
  if (v.type === 'text') {
    raw = v.preserveNewlines ? el.text().replace(/\s*\n\s*/g, '\n') : el.text();
  } else {
    raw = el.attr(v.name ?? '') ?? '';
  }
  if (rule.normalize?.trim) raw = raw.trim();
  if (rule.normalize?.collapseWhitespace) raw = raw.replace(/\s+/g, ' ').trim();
  return raw === '' ? null : raw;
}

function extractFirstRule($: CheerioAPI, $container: cheerio.Cheerio<Element>, rules: ExtractorRule[]): string {
  for (const rule of rules) {
    const v = extractWithRule($, $container, rule);
    if (v != null) return v;
  }
  return '';
}

function kindFromPath(pathRaw: string): AttachmentKind {
  const normalized = pathRaw.replace(/\\/g, '/');
  for (const { pattern, kind } of ATTACHMENT_PATH_PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }
  return 'unknown';
}

/** Path relative to assetsDir (export root). Strip leading ./ and keep path as given relative to root. */
function relativePath(pathRaw: string, _assetsDir: string): string {
  const s = pathRaw.replace(/\\/g, '/').replace(/^\.\//, '');
  return s;
}

function parseAttachments(
  $: CheerioAPI,
  $container: cheerio.Cheerio<Element>,
  assetsDir: string
): TranscriptAttachment[] {
  const out: TranscriptAttachment[] = [];
  const seen = new Set<string>();
  $container.find('a[href], img[src]').each((_, el) => {
    const href = $(el).attr('href') ?? $(el).attr('src') ?? '';
    const pathNorm = relativePath(href, assetsDir);
    if (!pathNorm || pathNorm.startsWith('http') || pathNorm.startsWith('#')) return;
    if (seen.has(pathNorm)) return;
    seen.add(pathNorm);
    const kind = kindFromPath(pathNorm);
    out.push({ kind, path: pathNorm });
  });
  return out;
}

export function assignMessageIds(messages: Omit<TranscriptMessage, 'id'>[]): TranscriptMessage[] {
  return messages.map((m, i) => ({
    ...m,
    id: 'm' + String(i + 1).padStart(6, '0'),
  }));
}

/**
 * Parse HTML with two-phase ts: (1) div.pull_right.date.details[title], (2) text + current date from date separator.
 * Messages without any ts are skipped (0 TS_PARSE_MISSING). Sender empty + has div.text → leo. Text empty + attachments → [attachment].
 */
export function parseAndAssignIds(
  inputFile: string,
  profilePath?: string,
  tz?: string,
  assetsDir?: string
): TranscriptMessage[] {
  const html = readFileSync(inputFile, 'utf-8');
  let profileToUse = profilePath ?? DEFAULT_PROFILE_PATH;
  if (profileToUse && !profileToUse.includes('/') && !profileToUse.endsWith('.json')) {
    profileToUse = `profiles/extractors/${profileToUse}.json`;
  }
  const profile = loadProfile(profileToUse);
  const $ = cheerio.load(html);

  let containers = $(profile.message.containerSelector).toArray();
  const ignoreSelectors = profile.message.ignoreSelectors ?? [];
  if (ignoreSelectors.length > 0) {
    containers = containers.filter((el) => {
      const $el = $(el);
      return !ignoreSelectors.some((sel) => $el.is(sel));
    });
  }

  const exportRoot = assetsDir ?? resolve(inputFile, '..');
  const defaultOffset = 'UTC+09:00';
  const messages: Omit<TranscriptMessage, 'id'>[] = [];

  for (const el of containers) {
    const $container = $(el);

    const $tsEl = $container.find(TS_ATTR_SELECTOR).first();
    let tsRawFromAttrTitle = ($tsEl.attr('title') ?? '').trim();
    const tsTextOnly = ($tsEl.length ? $tsEl.text() : '').trim().replace(/\s+/g, ' ');

    let tsRaw = '';
    if (tsRawFromAttrTitle) {
      tsRaw = tsRawFromAttrTitle;
    } else if (tsTextOnly) {
      const dateEl = $container.prevAll(DATE_SEPARATOR_SELECTOR).first();
      const dateSeparatorText = dateEl.length ? dateEl.text().trim() : '';
      const dateDDMMYYYY = parseDateSeparatorToDDMMYYYY(dateSeparatorText);
      const offsetStr = defaultOffset;
      if (dateDDMMYYYY) {
        tsRaw = buildFullTsFromDateAndTime(dateDDMMYYYY, tsTextOnly, offsetStr);
      }
    }

    if (!tsRaw) continue;

    const ts = parseTelegramTitleTs(tsRaw, tz) ?? '';
    if (!ts) continue;

    let senderRaw = extractFirstRule($, $container, profile.sender.rules);
    if (!senderRaw && $container.find('div.text').length > 0) senderRaw = 'leo';
    const sender = normalizeSender(senderRaw);

    let text = extractFirstRule($, $container, profile.text.rules);
    const attachments = parseAttachments($, $container, exportRoot);
    if (!text && attachments.length > 0) text = '[attachment]';

    messages.push({
      id: '',
      ts,
      ts_raw: tsRaw,
      sender,
      text,
      reply_to: null,
      attachments,
    });
  }

  return assignMessageIds(messages);
}
