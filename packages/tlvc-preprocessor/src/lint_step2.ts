/**
 * Run Step2 lint: residual examples -> runLintStep2.
 */

import type { SanitizedTranscript, SegmentsTopK } from 'tlvc-schema';
import { runLintStep2 } from 'tlvc-rules';

export function runLint(
  transcript: SanitizedTranscript,
  topk: SegmentsTopK,
  residualExamples: string[]
) {
  return runLintStep2(transcript, topk, residualExamples);
}
