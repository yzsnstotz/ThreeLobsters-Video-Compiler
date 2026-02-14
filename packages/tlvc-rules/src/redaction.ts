/**
 * Redaction rules: REDACT_PATTERNS (order fixed). Hit => replace with ***, count by_rule and total_hits.
 * Same patterns used for second-scan residual detection (lint SENSITIVE_REMAIN).
 */

export interface RedactPattern {
  rule_id: string;
  pattern: RegExp;
}

/** Order fixed for deterministic by_rule and second-scan. */
export const REDACT_PATTERNS: RedactPattern[] = [
  { rule_id: 'auth.bearer', pattern: /Authorization\s*:\s*Bearer\s+[^\s]+/gi },
  { rule_id: 'auth.api_key', pattern: /X-API-Key\s*:\s*[^\s]+/gi },
  { rule_id: 'token.generic', pattern: /(?:token|key)\s*[=:]\s*["']?[\w-]{20,}["']?/gi },
  { rule_id: 'path.unix', pattern: /\/Users\/[^\s"')\]]+/g },
  { rule_id: 'path.home', pattern: /~\/[^\s"')\]]+/g },
  { rule_id: 'network.ip', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  { rule_id: 'contact.email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { rule_id: 'contact.phone', pattern: /\b(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b/g },
];

export function redactText(text: string): { sanitized: string; hits: Record<string, number> } {
  let sanitized = text;
  const hits: Record<string, number> = {};
  for (const { rule_id, pattern } of REDACT_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, '***');
    const count = (before.match(pattern) ?? []).length;
    if (count > 0) hits[rule_id] = (hits[rule_id] ?? 0) + count;
  }
  return { sanitized, hits };
}

/**
 * Second-scan: run same patterns on text (no replace). Returns list of matched snippets for lint examples.
 */
export function scanResiduals(text: string): { rule_id: string; snippet: string }[] {
  const out: { rule_id: string; snippet: string }[] = [];
  for (const { rule_id, pattern } of REDACT_PATTERNS) {
    const m = text.match(pattern);
    if (m) for (const s of m) out.push({ rule_id, snippet: s.slice(0, 80) });
  }
  return out;
}
