/**
 * Segment only on error triggers. Window pre=6, post=12 from rules.
 * Merge: overlap or gap<=1. Length 10-60: extend if <10, trim from both ends if >60 (prefer keeping near error hits).
 * segment_id s001, s002...
 */

import type { TranscriptMessage } from 'tlvc-schema';
import {
  SEGMENT_WINDOW_PRE,
  SEGMENT_WINDOW_POST,
  getErrorTriggers,
  matchErrorTriggers,
} from 'tlvc-rules';

export interface TriggerHit {
  trigger_id: string;
  category: string;
  message_index: number;
}

export interface RawSegment {
  segment_id: string;
  startIndex: number;
  endIndex: number;
  message_ids: string[];
  trigger_hits: TriggerHit[];
  start_ts: string;
  end_ts: string;
}

function getWindow(messageIndex: number, total: number): { start: number; end: number } {
  const pre = SEGMENT_WINDOW_PRE;
  const post = SEGMENT_WINDOW_POST;
  const start = Math.max(0, messageIndex - pre);
  const end = Math.min(total - 1, messageIndex + post);
  return { start, end };
}

function mergeRanges(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end + 1) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function expandToMin(
  start: number,
  end: number,
  minLen: number,
  total: number
): { start: number; end: number } {
  let s = start;
  let e = end;
  while (e - s + 1 < minLen && (s > 0 || e < total - 1)) {
    if (s > 0) s--;
    if (e - s + 1 >= minLen) break;
    if (e < total - 1) e++;
  }
  return { start: s, end: Math.min(e, total - 1) };
}

function trimToMax(
  start: number,
  end: number,
  maxLen: number,
  _messages: TranscriptMessage[],
  errorIndices: Set<number>
): { start: number; end: number } {
  const len = end - start + 1;
  if (len <= maxLen) return { start, end };
  const total = end - start + 1;
  let bestStart = start;
  let bestCount = 0;
  for (let i = start; i <= end - maxLen + 1; i++) {
    let count = 0;
    for (let j = i; j < i + maxLen; j++) {
      if (errorIndices.has(j)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = i;
    }
  }
  return { start: bestStart, end: bestStart + maxLen - 1 };
}

export function segment(messages: TranscriptMessage[]): RawSegment[] {
  const total = messages.length;
  if (total === 0) return [];

  const windows: { start: number; end: number }[] = [];
  for (let i = 0; i < total; i++) {
    if (matchErrorTriggers(messages[i].text).length === 0) continue;
    const { start, end } = getWindow(i, total);
    windows.push({ start, end });
  }

  const merged = mergeRanges(windows);
  const MIN_LEN = 10;
  const MAX_LEN = 60;
  const segments: RawSegment[] = [];

  for (let i = 0; i < merged.length; i++) {
    let start = merged[i].start;
    let end = merged[i].end;
    const expanded = expandToMin(start, end, MIN_LEN, total);
    start = expanded.start;
    end = expanded.end;
    const errorIndicesInRange = new Set<number>();
    for (let j = start; j <= end; j++) {
      if (matchErrorTriggers(messages[j].text).length > 0) errorIndicesInRange.add(j);
    }
    const trimmed = trimToMax(start, end, MAX_LEN, messages, errorIndicesInRange);
    start = trimmed.start;
    end = trimmed.end;

    const message_ids = messages
      .slice(start, end + 1)
      .map((m) => m.id)
      .filter(Boolean);
    const trigger_hits: TriggerHit[] = [];
    for (let j = start; j <= end; j++) {
      const ids = matchErrorTriggers(messages[j].text);
      for (const id of ids) trigger_hits.push({ trigger_id: id, category: 'error', message_index: j });
    }
    const start_ts = messages[start]?.ts ?? '';
    const end_ts = messages[end]?.ts ?? '';
    const segment_id = 's' + String(segments.length + 1).padStart(3, '0');
    segments.push({
      segment_id,
      startIndex: start,
      endIndex: end,
      message_ids,
      trigger_hits,
      start_ts,
      end_ts,
    });
  }

  return segments;
}
