/**
 * Scoring rules: order = reasons output order. Each rule has rule_id, points, detail.
 * Conflict (error) strength, tri-role participation, compressibility, conclusion phrase.
 */

import type { SanitizedTranscript } from 'tlvc-schema';

export interface ScoringRule {
  rule_id: string;
  compute: (segment: { message_ids: string[]; trigger_hits?: { trigger_id: string; category: string }[] }, transcript: SanitizedTranscript) => { points: number; detail: string };
}

/** Order fixed = reasons output order. */
export const SCORING_RULES: ScoringRule[] = [
  {
    rule_id: 'conflict.error',
    compute: (seg, _t) => {
      const errHits = (seg.trigger_hits ?? []).filter((h) => h.category === 'error');
      const points = Math.min(50, errHits.length * 15);
      return { points, detail: errHits.length ? `Error triggers: ${errHits.map((h) => h.trigger_id).join(', ')}` : 'No error triggers' };
    },
  },
  {
    rule_id: 'roles.tri',
    compute: (seg, transcript) => {
      const senders = new Set<string>();
      const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
      for (const id of seg.message_ids) {
        const m = msgMap.get(id);
        if (m && ['ao000', 'ao001', 'ao002'].includes(m.sender)) senders.add(m.sender);
      }
      const n = senders.size;
      const points = n >= 3 ? 35 : n >= 2 ? 20 : n * 10;
      return { points, detail: `Tri-roles: ${n}` };
    },
  },
  {
    rule_id: 'roles.diversity.min2',
    compute: (seg, transcript) => {
      const senders = new Set<string>();
      const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
      for (const id of seg.message_ids) {
        const m = msgMap.get(id);
        if (m) senders.add(m.sender);
      }
      const points = senders.size >= 2 ? 15 : 0;
      return { points, detail: `Distinct roles: ${senders.size}` };
    },
  },
  {
    rule_id: 'compress.short',
    compute: (seg, transcript) => {
      const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
      let totalLen = 0;
      for (const id of seg.message_ids) {
        const m = msgMap.get(id);
        if (m) totalLen += m.text.length;
      }
      const avg = seg.message_ids.length ? totalLen / seg.message_ids.length : 0;
      const points = avg <= 80 ? 15 : avg <= 150 ? 8 : 0;
      return { points, detail: `Avg msg length: ${Math.round(avg)}` };
    },
  },
  {
    rule_id: 'conclusion.phrase',
    compute: (seg, transcript) => {
      const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
      const texts = seg.message_ids.map((id) => msgMap.get(id)?.text ?? '').join(' ');
      const conclusion = /\b(so|therefore|thus|in conclusion|summary|done|fixed|resolved)\b/i.test(texts);
      const points = conclusion ? 10 : 0;
      return { points, detail: conclusion ? 'Conclusion phrase hit' : 'No conclusion phrase' };
    },
  },
];

export function scoreSegment(
  segment: { message_ids: string[]; trigger_hits?: { trigger_id: string; category: string }[] },
  transcript: SanitizedTranscript
): { score: number; reasons: { rule_id: string; points: number; detail: string }[] } {
  const reasons: { rule_id: string; points: number; detail: string }[] = [];
  let total = 0;
  for (const rule of SCORING_RULES) {
    const { points, detail } = rule.compute(segment, transcript);
    reasons.push({ rule_id: rule.rule_id, points, detail });
    total += points;
  }
  return { score: total, reasons };
}
