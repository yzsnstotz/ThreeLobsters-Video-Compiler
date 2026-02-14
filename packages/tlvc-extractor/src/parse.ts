/**
 * Profile-driven HTML message extraction. Deterministic: same profile + html => same output.
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Sender } from 'tlvc-schema';
import type {
  ExtractorProfile,
  ExtractorRule,
  ParsedMessage,
  ParsedAttachment,
  ParseStats,
  ExtractionDebug,
  FieldExtractionDebug,
} from './types';

export function normalizeSender(raw: string): Sender {
  const s = (raw ?? '').trim();
  const lower = s.toLowerCase();
  if (/ao000/.test(lower)) return 'ao000';
  if (/ao001/.test(lower)) return 'ao001';
  if (/ao002/.test(lower)) return 'ao002';
  if (/\bleo\b|\byzliu\b/i.test(s)) return 'leo';
  if (/^yz\b|yz\s*@/i.test(s)) return 'leo';
  if (/\bsystem\b/.test(lower)) return 'system';
  return 'unknown';
}

function applyNormalize(s: string, rule: ExtractorRule): string {
  let out = s;
  const n = rule.normalize;
  if (n?.trim) out = out.trim();
  if (n?.collapseWhitespace) out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function extractWithRule($container: cheerio.Cheerio<cheerio.Element>, rule: ExtractorRule): string | null {
  const el = $container.find(rule.selector).first();
  if (el.length === 0) return null;
  const v = rule.value;
  let raw: string;
  if (v.type === 'text') {
    raw = v.preserveNewlines ? el.text().replace(/\s*\n\s*/g, '\n') : el.text();
  } else {
    const attrName = v.name ?? '';
    raw = el.attr(attrName) ?? '';
  }
  const normalized = applyNormalize(raw, rule);
  return normalized === '' ? null : normalized;
}

function extractField(
  $container: cheerio.Cheerio<cheerio.Element>,
  rules: ExtractorRule[]
): { value: string; ruleIndex: number } | null {
  for (let i = 0; i < rules.length; i++) {
    const v = extractWithRule($container, rules[i]);
    if (v != null) return { value: v, ruleIndex: i };
  }
  return null;
}

const SAMPLE_TRUNCATE = 80;
const MAX_EXAMPLE_SAMPLES = 3;

const ATTACHMENT_PATH_PATTERNS: Array<{ pattern: RegExp; kind: ParsedAttachment['kind'] }> = [
  { pattern: /^(?:\.\/)?photos\//i, kind: 'photo' },
  { pattern: /^(?:\.\/)?(?:video_files|videos?)\//i, kind: 'video' },
  { pattern: /^(?:\.\/)?files\//i, kind: 'file' },
  { pattern: /^(?:\.\/)?stickers\//i, kind: 'sticker' },
  { pattern: /^(?:\.\/)?voice_messages\//i, kind: 'voice' },
];

function kindFromPath(pathRaw: string): ParsedAttachment['kind'] {
  const normalized = pathRaw.replace(/\\/g, '/');
  for (const { pattern, kind } of ATTACHMENT_PATH_PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }
  return 'unknown';
}

function parseAttachmentsInContainer(
  $: CheerioAPI,
  $container: cheerio.Cheerio<cheerio.Element>
): ParsedAttachment[] {
  const out: ParsedAttachment[] = [];
  const seen = new Set<string>();
  $container.find('a[href], img[src]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? $el.attr('src') ?? '';
    const pathNorm = href.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!pathNorm || pathNorm.startsWith('http') || pathNorm.startsWith('#')) return;
    if (seen.has(pathNorm)) return;
    seen.add(pathNorm);
    out.push({ kind: kindFromPath(pathNorm), path: pathNorm });
  });
  return out;
}

export interface ParseWithProfileResult {
  messages: ParsedMessage[];
  stats: ParseStats;
  sample_extractions?: Array<{ message_index: number; fields: Array<{ field: string; rule_index: number; selector: string; value_preview: string }> }>;
  extractionDebug?: ExtractionDebug;
}

/**
 * Parse HTML with profile. First 200 messages returned; stats cover full count.
 * sample_extractions: for first few messages, which rule matched per field (for Studio preview).
 */
export function parseMessagesFromHtml(
  html: string,
  profile: ExtractorProfile,
  options?: { maxPreviewMessages?: number; includeSampleExtractions?: boolean; includeExtractionDebug?: boolean }
): ParseWithProfileResult {
  const $ = cheerio.load(html);
  let containers = $(profile.message.containerSelector).toArray();
  const ignoreSelectors = profile.message.ignoreSelectors ?? [];
  if (ignoreSelectors.length > 0) {
    containers = containers.filter((el) => {
      const $el = $(el);
      return !ignoreSelectors.some((sel) => $el.is(sel));
    });
  }
  const maxPreview = options?.maxPreviewMessages ?? 0;
  const includeSamples = options?.includeSampleExtractions ?? false;
  const includeExtractionDebug = options?.includeExtractionDebug ?? false;

  const messages: ParsedMessage[] = [];
  let tsMissingCount = 0;
  const senderDist: Record<string, number> = {};

  if (containers.length === 0) {
    const bodyHtml = $('body').length ? $('body').html() ?? '' : $.html();
    const fallbackText = bodyHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (fallbackText) {
      messages.push({
        ts: '',
        sender: 'unknown',
        text: fallbackText,
        reply_to: null,
      });
    }
    return {
      messages,
      stats: { total_messages: messages.length, ts_missing_count: 0, sender_distribution: { unknown: messages.length } },
      sample_extractions: undefined,
    };
  }

  const limit = maxPreview > 0 ? Math.min(containers.length, maxPreview) : containers.length;
  let lastSenderRaw = '';

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const $container = $(container);

    const senderResult = extractField($container, profile.sender.rules);
    const tsResult = extractField($container, profile.ts.rules);
    const textResult = extractField($container, profile.text.rules);

    let senderRaw = senderResult?.value ?? '';
    const classList = ($container.attr('class') ?? '').trim();
    const isJoined = classList.split(/\s+/).includes('joined');
    if (senderRaw === '' && isJoined && lastSenderRaw !== '') {
      senderRaw = lastSenderRaw;
    }
    const sender = normalizeSender(senderRaw);
    if (sender !== 'unknown') lastSenderRaw = senderRaw;
    senderDist[sender] = (senderDist[sender] ?? 0) + 1;

    const ts = (tsResult?.value ?? '').trim();
    if (!ts) tsMissingCount++;

    const text = textResult?.value ?? '';
    const reply_to = profile.reply_to
      ? extractField($container, profile.reply_to.rules)?.value ?? null
      : null;

    const attachments = parseAttachmentsInContainer($, $container);
    const msg: ParsedMessage = {
      ts,
      sender,
      text,
      reply_to: reply_to as string | null,
      attachments,
    };

    if (i < limit) messages.push(msg);
  }

  const stats: ParseStats = {
    total_messages: containers.length,
    ts_missing_count: tsMissingCount,
    sender_distribution: senderDist,
  };

  let sample_extractions: ParseWithProfileResult['sample_extractions'];
  if (includeSamples && messages.length > 0) {
    const sampleSize = Math.min(3, messages.length);
    sample_extractions = [];
    for (let i = 0; i < sampleSize; i++) {
      const $c = $(containers[i]);
      const fields: Array<{ field: string; rule_index: number; selector: string; value_preview: string }> = [];
      for (const [fieldName, config] of [
        ['sender', profile.sender],
        ['ts', profile.ts],
        ['text', profile.text],
      ] as const) {
        const r = extractField($c, config.rules);
        if (r) {
          fields.push({
            field: fieldName,
            rule_index: r.ruleIndex,
            selector: config.rules[r.ruleIndex].selector,
            value_preview: r.value.slice(0, SAMPLE_TRUNCATE) + (r.value.length > SAMPLE_TRUNCATE ? '...' : ''),
          });
        }
      }
      sample_extractions.push({ message_index: i, fields });
    }
  }

  let extractionDebug: ExtractionDebug | undefined;
  if (options?.includeExtractionDebug && containers.length > 0) {
    const senderHits: number[] = new Array(profile.sender.rules.length).fill(0);
    const tsHits: number[] = new Array(profile.ts.rules.length).fill(0);
    const textHits: number[] = new Array(profile.text.rules.length).fill(0);
    const senderExamples: Map<number, string[]> = new Map();
    const tsExamples: Map<number, string[]> = new Map();
    const textExamples: Map<number, string[]> = new Map();
    for (let i = 0; i < containers.length; i++) {
      const $c = $(containers[i]);
      const sr = extractField($c, profile.sender.rules);
      if (sr != null) {
        senderHits[sr.ruleIndex]++;
        if (!senderExamples.has(sr.ruleIndex)) senderExamples.set(sr.ruleIndex, []);
        const arr = senderExamples.get(sr.ruleIndex)!;
        if (arr.length < MAX_EXAMPLE_SAMPLES) {
          arr.push(sr.value.length > SAMPLE_TRUNCATE ? sr.value.slice(0, SAMPLE_TRUNCATE) + '...' : sr.value);
        }
      }
      const tr = extractField($c, profile.ts.rules);
      if (tr != null) {
        tsHits[tr.ruleIndex]++;
        if (!tsExamples.has(tr.ruleIndex)) tsExamples.set(tr.ruleIndex, []);
        const arr = tsExamples.get(tr.ruleIndex)!;
        if (arr.length < MAX_EXAMPLE_SAMPLES) {
          arr.push(tr.value.length > SAMPLE_TRUNCATE ? tr.value.slice(0, SAMPLE_TRUNCATE) + '...' : tr.value);
        }
      }
      const txr = extractField($c, profile.text.rules);
      if (txr != null) {
        textHits[txr.ruleIndex]++;
        if (!textExamples.has(txr.ruleIndex)) textExamples.set(txr.ruleIndex, []);
        const arr = textExamples.get(txr.ruleIndex)!;
        if (arr.length < MAX_EXAMPLE_SAMPLES) {
          arr.push(txr.value.length > SAMPLE_TRUNCATE ? txr.value.slice(0, SAMPLE_TRUNCATE) + '...' : txr.value);
        }
      }
    }
    const toFieldDebug = (hits: number[], examplesMap: Map<number, string[]>): FieldExtractionDebug => ({
      ruleHits: hits.map((hitCount, ruleIndex) => ({ ruleIndex, hitCount })).filter((x) => x.hitCount > 0),
      examples: Array.from(examplesMap.entries()).map(([ruleIndex, samples]) => ({ ruleIndex, samples })),
    });
    extractionDebug = {
      containerMatches: containers.length,
      perField: {
        sender: toFieldDebug(senderHits, senderExamples),
        ts: toFieldDebug(tsHits, tsExamples),
        text: toFieldDebug(textHits, textExamples),
      },
    };
  }

  return {
    messages,
    stats,
    sample_extractions,
    extractionDebug,
  };
}
