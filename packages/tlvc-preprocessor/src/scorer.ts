/**
 * Score segments with tlvc-rules scoring; add roles (count by message_ids -> sender).
 * topK sorted by score desc, then segment_id asc.
 */

import type { SanitizedTranscript, SegmentsTopK, TopKSegment, SegmentRoles } from 'tlvc-schema';
import { scoreSegment } from 'tlvc-rules';
import type { RawSegment } from './segmenter';

const ROLE_KEYS = ['ao000', 'ao001', 'ao002', 'leo', 'system', 'unknown'] as const;

function countRoles(messageIds: string[], transcript: SanitizedTranscript): SegmentRoles {
  const roles: SegmentRoles = { ao000: 0, ao001: 0, ao002: 0, leo: 0, system: 0, unknown: 0 };
  const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
  for (const id of messageIds) {
    const m = msgMap.get(id);
    const s = m?.sender ?? 'unknown';
    if (s in roles) roles[s as keyof SegmentRoles]++;
  }
  return roles;
}

export function scoreSegments(
  rawSegments: RawSegment[],
  transcript: SanitizedTranscript,
  k: number
): SegmentsTopK {
  const withScores: TopKSegment[] = rawSegments.map((seg) => {
    const trigger_hits = seg.trigger_hits.map((h) => ({ trigger_id: h.trigger_id, category: h.category }));
    const { score, reasons } = scoreSegment(
      { message_ids: seg.message_ids, trigger_hits },
      transcript
    );
    const roles = countRoles(seg.message_ids, transcript);
    return {
      segment_id: seg.segment_id,
      start_ts: seg.start_ts,
      end_ts: seg.end_ts,
      message_ids: seg.message_ids,
      score,
      reasons,
      roles,
    };
  });

  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.segment_id.localeCompare(b.segment_id);
  });

  const topK = withScores.slice(0, k);
  return {
    meta: {
      ep: transcript.meta.ep,
      k,
      tz: transcript.meta.tz,
      input_kind: transcript.meta.input_kind,
      export_root: transcript.meta.export_root,
      messages_html: transcript.meta.messages_html,
    },
    segments: topK,
  };
}
