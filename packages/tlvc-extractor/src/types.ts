/**
 * Profile-driven extractor types. Used by CLI and Studio.
 */

import type { Sender } from 'tlvc-schema';

export interface ExtractorValue {
  type: 'text' | 'attr';
  /** Attribute name when type is "attr". */
  name?: string;
  preserveNewlines?: boolean;
}

export interface ExtractorNormalize {
  trim?: true;
  collapseWhitespace?: true;
}

/** Optional meta for profile (v1). Auto-filled on save when missing. */
export interface ExtractorProfileMeta {
  id: string;
  name: string;
  version: number;
  updatedAt: string; // ISO
}

export interface ExtractorRule {
  selector: string;
  value: ExtractorValue;
  normalize?: ExtractorNormalize;
}

export interface ExtractorFieldConfig {
  rules: ExtractorRule[];
}

export interface ExtractorProfile {
  meta?: ExtractorProfileMeta;
  /** CSS selector for each message block (e.g. "div.message"). */
  message: {
    containerSelector: string;
  };
  sender: ExtractorFieldConfig;
  ts: ExtractorFieldConfig;
  text: ExtractorFieldConfig;
  /** reply_to optional for now */
  reply_to?: ExtractorFieldConfig;
}

export interface ParsedMessage {
  ts: string;
  sender: Sender;
  text: string;
  reply_to: string | null;
}

export interface ParseStats {
  total_messages: number;
  ts_missing_count: number;
  sender_distribution: Record<string, number>;
}

export interface SampleExtraction {
  field: string;
  rule_index: number;
  selector: string;
  value_preview: string;
}

/** Per-field extraction debug: which rule hit and how many, plus sample values. */
export interface ExtractionDebug {
  containerMatches: number;
  perField: {
    sender: FieldExtractionDebug;
    ts: FieldExtractionDebug;
    text: FieldExtractionDebug;
  };
}

export interface FieldExtractionDebug {
  ruleHits: Array<{ ruleIndex: number; hitCount: number }>;
  examples: Array<{ ruleIndex: number; samples: string[] }>;
}
