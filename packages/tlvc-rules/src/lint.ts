/**
 * Step2 lint: errors (SENSITIVE_REMAIN, TOP1_LEN_OUT_OF_RANGE, TOP1_NO_ERROR_TRIGGER) => exit 2.
 * Warnings: TOP1_LOW_ROLE_DIVERSITY; ts parse fail => warning only.
 */

import type { LintReportStep2, LintEntry } from 'tlvc-schema';
import type { SanitizedTranscript, SegmentsTopK } from 'tlvc-schema';
import { getErrorTriggers } from './triggers';

const ROLE_KEYS = ['ao000', 'ao001', 'ao002', 'leo', 'system', 'unknown'] as const;

export function runLintStep2(
  transcript: SanitizedTranscript,
  topk: SegmentsTopK,
  residualExamples: string[]
): LintReportStep2 {
  const errors: LintEntry[] = [];
  const warnings: LintEntry[] = [];
  const infos: LintEntry[] = [];

  if (residualExamples.length > 0) {
    errors.push({
      code: 'SENSITIVE_REMAIN',
      message: `Sensitive pattern residual detected (${residualExamples.length} example(s))`,
      examples: residualExamples.slice(0, 10).map((s) => s.slice(0, 80)),
    });
  }

  const top1 = topk.segments[0];
  if (top1) {
    const len = top1.message_ids.length;
    if (len < 10 || len > 60) {
      errors.push({
        code: 'TOP1_LEN_OUT_OF_RANGE',
        message: `Top1 segment has ${len} messages (required 10-60)`,
      });
    }

    const msgMap = new Map(transcript.messages.map((m) => [m.id, m]));
    let hasErrorTrigger = false;
    const errorTriggerIds = getErrorTriggers().map((t) => t.id);
    for (const mid of top1.message_ids) {
      const m = msgMap.get(mid);
      if (!m) continue;
      for (const t of getErrorTriggers()) {
        if (t.pattern.test(m.text)) {
          hasErrorTrigger = true;
          break;
        }
        t.pattern.lastIndex = 0;
      }
      if (hasErrorTrigger) break;
    }
    if (!hasErrorTrigger) {
      errors.push({
        code: 'TOP1_NO_ERROR_TRIGGER',
        message: 'Top1 segment does not hit any error trigger',
      });
    }

    const roles = top1.roles;
    const nonZero = ROLE_KEYS.filter((k) => (roles[k] ?? 0) > 0).length;
    if (nonZero < 2) {
      warnings.push({
        code: 'TOP1_LOW_ROLE_DIVERSITY',
        message: `Top1 has only ${nonZero} distinct role(s)`,
      });
    }
  }

  const tsRawMissing = transcript.messages.filter((m) => !m.ts_raw || m.ts_raw.trim() === '').length;
  if (tsRawMissing > 0) {
    warnings.push({
      code: 'TS_PARSE_MISSING',
      message: `${tsRawMissing} message(s) have missing ts_raw`,
    });
  }

  const tsParseFailed = transcript.messages.filter((m) => {
    const raw = m.ts_raw?.trim();
    return raw && raw.length > 0 && (!m.ts || m.ts === '');
  });
  if (tsParseFailed.length > 0) {
    const examples = tsParseFailed.slice(0, 10).map((m) => (m.ts_raw ?? '').slice(0, 80));
    warnings.push({
      code: 'TS_PARSE_FAILED',
      message: `${tsParseFailed.length} message(s) have ts_raw but parse failed`,
      examples,
    });
  }

  const ok = errors.length === 0;
  const exit_code = ok ? 0 : 2;
  return {
    ok,
    exit_code,
    summary: { errors: errors.length, warnings: warnings.length, infos: infos.length },
    errors,
    warnings,
    infos,
  };
}
