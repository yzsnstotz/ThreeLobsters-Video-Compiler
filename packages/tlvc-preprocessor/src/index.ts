/**
 * Step2 pipeline: resolve input -> html_parser -> redactor -> segmenter -> scorer -> lint -> write.
 * preprocessEpisode returns transcript, topk, lintReport, exitCode (0 | 1 | 2).
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SanitizedTranscript, SegmentsTopK, LintReportStep2 } from 'tlvc-schema';
import {
  stableStringify,
  KEY_ORDER_TRANSCRIPT,
  KEY_ORDER_SEGMENTS,
  KEY_ORDER_LINT,
} from 'tlvc-schema';
import { resolveTelegramExportInput } from './input_resolver';

export type { ResolvedTelegramExportInput } from './input_resolver';
export { resolveTelegramExportInput, EXPORT_HTML_CANDIDATES } from './input_resolver';
import { parseAndAssignIds } from './html_parser';
import { redactMessages } from './redactor';
import { segmentWithFallback } from './segmenter';
import { matchTriggers } from 'tlvc-rules';
import { scoreSegments } from './scorer';
import { runLint } from './lint_step2';

const STEP2_DIR = 'step2_preprocess';
const FILES = {
  transcript: 'sanitized.transcript.json',
  segments: 'segments.topk.json',
  lint: 'lint_report.step2.json',
  preview: 'preview.tsv',
} as const;

export interface PreprocessOptions {
  /** Path to messages.html or Telegram export folder (containing messages.html). */
  input: string;
  epId: string;
  outDir: string;
  k: number;
  tz: string;
  /** Path to extractor profile JSON (default: profiles/extractors/telegram_export_v1.json). */
  profilePath?: string;
}

export interface PreprocessResult {
  transcript: SanitizedTranscript;
  topk: SegmentsTopK;
  lintReport: LintReportStep2;
  exitCode: 0 | 1 | 2;
}

function normalizeOutDir(outDir: string): string {
  return outDir.replace(/\/+$/, '');
}

export async function preprocessEpisode(options: PreprocessOptions): Promise<PreprocessResult> {
  const { input, epId, outDir, k, tz } = options;
  const resolved = await resolveTelegramExportInput(input);
  const baseDir = join(normalizeOutDir(outDir), STEP2_DIR);

  const messages = parseAndAssignIds(resolved.messagesHtmlPath, options.profilePath, tz, resolved.exportRootDir);
  const { transcript, residualExamples } = redactMessages(messages, {
    ep: epId,
    tz,
    input_kind: resolved.kind,
    export_root: resolved.exportRootDir,
    messages_html: resolved.messagesHtmlPath,
    source: {
      input_path: resolved.input_path,
      html_file: resolved.messagesHtmlPath,
      assets_dir: resolved.exportRootDir,
    },
  });
  const { segments: rawSegments, usedFallback } = segmentWithFallback(transcript.messages);
  const topk = scoreSegments(rawSegments, transcript, k);
  const trigger_stats = { error: 0, permission: 0, action: 0 };
  for (const m of transcript.messages) {
    for (const hit of matchTriggers(m.text)) {
      if (hit.category === 'error') trigger_stats.error += 1;
      else if (hit.category === 'permission') trigger_stats.permission += 1;
      else if (hit.category === 'action') trigger_stats.action += 1;
    }
  }
  topk.meta.segment_mode = usedFallback ? 'fallback' : 'error';
  topk.meta.trigger_stats = trigger_stats;
  const lintReport = runLint(transcript, topk, residualExamples);

  const exitCode: 0 | 2 = lintReport.exit_code;

  mkdirSync(baseDir, { recursive: true });
  writeFileSync(
    join(baseDir, FILES.transcript),
    stableStringify(transcript, KEY_ORDER_TRANSCRIPT),
    'utf-8'
  );
  writeFileSync(
    join(baseDir, FILES.segments),
    stableStringify(topk, KEY_ORDER_SEGMENTS),
    'utf-8'
  );
  writeFileSync(
    join(baseDir, FILES.lint),
    stableStringify(lintReport, KEY_ORDER_LINT),
    'utf-8'
  );

  const previewLines = [
    'idx\tts\tsender\ttext(truncate80)\tatt_count',
    ...transcript.messages.map((m, i) => {
      let text80 = (m.text ?? '').length > 80 ? (m.text ?? '').slice(0, 80) + '…' : (m.text ?? '');
      text80 = text80.replace(/\t/g, ' ').replace(/\n/g, ' ');
      const attCount = Array.isArray(m.attachments) ? m.attachments.length : 0;
      return `${i + 1}\t${m.ts}\t${m.sender}\t${text80}\t${attCount}`;
    }),
  ];
  writeFileSync(join(baseDir, FILES.preview), previewLines.join('\n'), 'utf-8');

  return { transcript, topk, lintReport, exitCode };
}

export { runDoctorStep2, printDoctorStep2 } from './doctor_step2';
export type { DoctorStep2Options, DoctorStep2Result } from './doctor_step2';

/** Default export for CJS/ESM interop (e.g. Studio server). */
export default {
  preprocessEpisode,
  resolveTelegramExportInput,
};
