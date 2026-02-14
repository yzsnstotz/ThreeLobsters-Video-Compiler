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
import { segment } from './segmenter';
import { scoreSegments } from './scorer';
import { runLint } from './lint_step2';

const STEP2_DIR = 'step2_preprocess';
const FILES = {
  transcript: 'sanitized.transcript.json',
  segments: 'segments.topk.json',
  lint: 'lint_report.step2.json',
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

  const messages = parseAndAssignIds(resolved.messagesHtmlPath, options.profilePath, tz);
  const { transcript, residualExamples } = redactMessages(messages, {
    ep: epId,
    tz,
    input_kind: resolved.kind,
    export_root: resolved.exportRootDir,
    messages_html: resolved.messagesHtmlPath,
  });
  const rawSegments = segment(transcript.messages);
  const topk = scoreSegments(rawSegments, transcript, k);
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

  return { transcript, topk, lintReport, exitCode };
}

/** Default export for CJS/ESM interop (e.g. Studio server). */
export default {
  preprocessEpisode,
  resolveTelegramExportInput,
};
