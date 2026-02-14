/**
 * Client-side types for extractor profile (mirrors tlvc-extractor for UI only).
 * Do not import from tlvc-extractor in client code - it is a Node package.
 */

export interface ExtractorValue {
  type: 'text' | 'attr';
  name?: string;
  preserveNewlines?: boolean;
}

export interface ExtractorNormalize {
  trim?: true;
  collapseWhitespace?: true;
}

export interface ExtractorRule {
  selector: string;
  value: ExtractorValue;
  normalize?: ExtractorNormalize;
}

export interface ExtractorFieldConfig {
  rules: ExtractorRule[];
}

export interface ExtractorProfileMeta {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
}

export interface ExtractorProfile {
  meta?: ExtractorProfileMeta;
  message: { containerSelector: string };
  sender: ExtractorFieldConfig;
  ts: ExtractorFieldConfig;
  text: ExtractorFieldConfig;
  reply_to?: ExtractorFieldConfig;
}
