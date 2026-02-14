/**
 * TLVC Step2 schema: types and stable JSON serialization.
 * Single source of truth for sanitized.transcript, segments.topk, lint_report.step2.
 */

export type Sender = 'ao000' | 'ao001' | 'ao002' | 'leo' | 'system' | 'unknown';

export interface TranscriptMessage {
  id: string;
  ts: string;
  /** Raw timestamp string from HTML (for lint: TS_PARSE_MISSING / TS_PARSE_FAILED). */
  ts_raw?: string;
  sender: Sender;
  text: string;
  reply_to: string | null;
  attachments: unknown[];
}

export interface SanitizedTranscriptMeta {
  ep: string;
  tz: string;
  version: string;
  input_kind: 'file' | 'dir';
  export_root: string;
  messages_html: string;
}

export interface SanitizedTranscript {
  meta: SanitizedTranscriptMeta;
  redaction: { total_hits: number; by_rule: Record<string, number> };
  messages: TranscriptMessage[];
}

export interface SegmentReason {
  rule_id: string;
  points: number;
  detail: string;
}

export interface SegmentRoles {
  ao000: number;
  ao001: number;
  ao002: number;
  leo: number;
  system: number;
  unknown: number;
}

export interface TopKSegment {
  segment_id: string;
  start_ts: string;
  end_ts: string;
  message_ids: string[];
  score: number;
  reasons: SegmentReason[];
  roles: SegmentRoles;
}

export interface SegmentsTopKMeta {
  ep: string;
  k: number;
  tz: string;
  input_kind: 'file' | 'dir';
  export_root: string;
  messages_html: string;
}

export interface SegmentsTopK {
  meta: SegmentsTopKMeta;
  segments: TopKSegment[];
}

export interface LintEntry {
  code: string;
  message: string;
  examples?: string[];
}

export interface LintReportSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface LintReportStep2 {
  ok: boolean;
  exit_code: 0 | 2;
  summary: LintReportSummary;
  errors: LintEntry[];
  warnings: LintEntry[];
  infos: LintEntry[];
}

/** Key order for stable JSON: root keys and nested object keys. */
export type KeyOrderMap = Record<string, string[]>;

const TRANSCRIPT_ROOT_KEYS = ['meta', 'redaction', 'messages'] as const;
const TRANSCRIPT_META_KEYS = ['ep', 'tz', 'version', 'input_kind', 'export_root', 'messages_html'] as const;
const REDACTION_KEYS = ['total_hits', 'by_rule'] as const;
const MESSAGE_KEYS = ['id', 'ts', 'ts_raw', 'sender', 'text', 'reply_to', 'attachments'] as const;

const SEGMENTS_ROOT_KEYS = ['meta', 'segments'] as const;
const SEGMENTS_META_KEYS = ['ep', 'k', 'tz', 'input_kind', 'export_root', 'messages_html'] as const;
const SEGMENT_KEYS = ['segment_id', 'start_ts', 'end_ts', 'message_ids', 'score', 'reasons', 'roles'] as const;
const REASON_KEYS = ['rule_id', 'points', 'detail'] as const;
const ROLES_KEYS = ['ao000', 'ao001', 'ao002', 'leo', 'system', 'unknown'] as const;

const LINT_ROOT_KEYS = ['ok', 'exit_code', 'summary', 'errors', 'warnings', 'infos'] as const;
const LINT_SUMMARY_KEYS = ['errors', 'warnings', 'infos'] as const;
const LINT_ENTRY_KEYS = ['code', 'message', 'examples'] as const;

/** Predefined key orders for the three output roots (for stableStringify). */
export const KEY_ORDER_TRANSCRIPT: KeyOrderMap = {
  '': [...TRANSCRIPT_ROOT_KEYS],
  meta: [...TRANSCRIPT_META_KEYS],
  redaction: [...REDACTION_KEYS],
  message: [...MESSAGE_KEYS],
};

export const KEY_ORDER_SEGMENTS: KeyOrderMap = {
  '': [...SEGMENTS_ROOT_KEYS],
  meta: [...SEGMENTS_META_KEYS],
  segments: ['segment_id', 'start_ts', 'end_ts', 'message_ids', 'score', 'reasons', 'roles'],
  segment: [...SEGMENT_KEYS],
  reasons: ['rule_id', 'points', 'detail'],
  reason: [...REASON_KEYS],
  roles: [...ROLES_KEYS],
};

export const KEY_ORDER_LINT: KeyOrderMap = {
  '': [...LINT_ROOT_KEYS],
  summary: [...LINT_SUMMARY_KEYS],
  errors: ['code', 'message', 'examples'],
  warnings: ['code', 'message', 'examples'],
  infos: ['code', 'message', 'examples'],
  entry: [...LINT_ENTRY_KEYS],
};

/**
 * Recursively serialize with explicit key order. Used for all three step2 JSON outputs.
 * path is used to look up key order (e.g. '' for root, 'meta', 'messages', etc.).
 */
function stableStringifyValue(
  value: unknown,
  keyOrderMap: KeyOrderMap,
  path: string
): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const subPath = path === 'messages' ? 'message' : path === 'segments' ? 'segment' : path === 'reasons' ? 'reason' : path === 'errors' || path === 'warnings' || path === 'infos' ? 'entry' : path;
    const parts = value.map((item) => stableStringifyValue(item, keyOrderMap, subPath));
    return '[' + parts.join(',') + ']';
  }
  const keys = keyOrderMap[path] ?? keyOrderMap[''] ?? Object.keys(value as object).sort();
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    const escapedKey = JSON.stringify(k);
    const subPath = path === '' ? k : k;
    parts.push(escapedKey + ':' + stableStringifyValue(v, keyOrderMap, subPath));
  }
  return '{' + parts.join(',') + '}';
}

/**
 * Serialize object with explicit key order. Use KEY_ORDER_TRANSCRIPT, KEY_ORDER_SEGMENTS, or KEY_ORDER_LINT.
 */
export function stableStringify(obj: unknown, keyOrderMap: KeyOrderMap): string {
  return stableStringifyValue(obj, keyOrderMap, '');
}
