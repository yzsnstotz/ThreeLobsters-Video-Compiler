/**
 * Redact message texts with REDACT_PATTERNS; aggregate by_rule and total_hits.
 * Second-scan: same patterns on sanitized.messages[].text → residual examples for lint.
 */

import type { SanitizedTranscript, TranscriptMessage } from 'tlvc-schema';
import { redactText, scanResiduals } from 'tlvc-rules';

export function redactMessages(
  messages: TranscriptMessage[],
  meta: {
    ep: string;
    tz: string;
    input_kind: 'file' | 'dir';
    export_root: string;
    messages_html: string;
    source?: { input_path: string; html_file: string; assets_dir: string };
  }
): { transcript: SanitizedTranscript; residualExamples: string[] } {
  const by_rule: Record<string, number> = {};
  let total_hits = 0;
  const sanitizedMessages: TranscriptMessage[] = [];

  for (const m of messages) {
    const { sanitized, hits } = redactText(m.text);
    for (const [rule_id, count] of Object.entries(hits)) {
      by_rule[rule_id] = (by_rule[rule_id] ?? 0) + count;
      total_hits += count;
    }
    sanitizedMessages.push({ ...m, text: sanitized });
  }

  const residualExamples: string[] = [];
  for (const m of sanitizedMessages) {
    const list = scanResiduals(m.text);
    for (const { snippet } of list) residualExamples.push(snippet);
  }

  const transcriptMeta: SanitizedTranscript['meta'] = {
    ep: meta.ep,
    tz: meta.tz,
    version: 'proto-0.1',
    input_kind: meta.input_kind,
    export_root: meta.export_root,
    messages_html: meta.messages_html,
  };
  if (meta.source) {
    transcriptMeta.source = meta.source;
  }

  const transcript: SanitizedTranscript = {
    meta: transcriptMeta,
    redaction: { total_hits, by_rule },
    messages: sanitizedMessages,
  };
  return { transcript, residualExamples };
}
