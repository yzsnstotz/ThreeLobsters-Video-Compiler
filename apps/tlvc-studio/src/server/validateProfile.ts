/**
 * Strong schema validation for ExtractorProfile. Reject save if errors; warnings allowed.
 */

import type { ExtractorProfile, ExtractorRule } from 'tlvc-extractor';

const TOO_WIDE_SELECTORS = ['div', 'body', '*', 'span'];
const CONTAINS_PATTERN = /\[[^\]]*\*=/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function addError(r: ValidationResult, msg: string): void {
  r.errors.push(msg);
}
function addWarning(r: ValidationResult, msg: string): void {
  r.warnings.push(msg);
}

function checkSelectorWidth(selector: string, field: string, ruleIndex: number, r: ValidationResult): void {
  const trimmed = selector.trim().toLowerCase();
  if (TOO_WIDE_SELECTORS.includes(trimmed)) {
    addError(r, `${field}.rules[${ruleIndex}].selector: selector too wide ("${selector}")`);
  }
  if (CONTAINS_PATTERN.test(selector)) {
    addWarning(r, `${field}.rules[${ruleIndex}].selector: contains-type selector [class*="..."] may match too much`);
  }
}

export function validateProfileStrict(profile: unknown, containerSelector: string): ValidationResult {
  const r: ValidationResult = { ok: true, errors: [], warnings: [] };

  if (!profile || typeof profile !== 'object') {
    addError(r, 'Invalid JSON');
    r.ok = false;
    return r;
  }
  const p = profile as Record<string, unknown>;

  if (!p.message || typeof p.message !== 'object') {
    addError(r, 'Missing message');
    r.ok = false;
    return r;
  }
  const msg = p.message as Record<string, unknown>;
  const container = (msg.containerSelector as string) ?? '';
  if (typeof container !== 'string' || !container.trim()) {
    addError(r, 'message.containerSelector is required and non-empty');
    r.ok = false;
  } else if (TOO_WIDE_SELECTORS.includes(container.trim().toLowerCase())) {
    addError(r, 'message.containerSelector is too wide');
    r.ok = false;
  }

  for (const field of ['sender', 'ts', 'text'] as const) {
    if (!p[field] || typeof p[field] !== 'object') {
      addError(r, `Missing ${field}`);
      r.ok = false;
      continue;
    }
    const cfg = p[field] as Record<string, unknown>;
    if (!Array.isArray(cfg.rules)) {
      addError(r, `Missing ${field}.rules`);
      r.ok = false;
      continue;
    }
    if (cfg.rules.length < 1) {
      addError(r, `${field}.rules must have at least one rule`);
      r.ok = false;
    }
    const rules = cfg.rules as ExtractorRule[];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule || typeof rule !== 'object') {
        addError(r, `${field}.rules[${i}] invalid`);
        r.ok = false;
        continue;
      }
      if (typeof rule.selector !== 'string' || !rule.selector.trim()) {
        addError(r, `${field}.rules[${i}].selector is required and non-empty`);
        r.ok = false;
      } else {
        checkSelectorWidth(rule.selector, field, i, r);
      }
      if (!rule.value || typeof rule.value !== 'object') {
        addError(r, `${field}.rules[${i}].value is required`);
        r.ok = false;
      } else {
        const v = rule.value as Record<string, unknown>;
        if (v.type !== 'text' && v.type !== 'attr') {
          addError(r, `${field}.rules[${i}].value.type must be "text" or "attr"`);
          r.ok = false;
        }
        if (v.type === 'attr' && typeof v.name !== 'string') {
          addError(r, `${field}.rules[${i}].value.name is required when type is "attr"`);
          r.ok = false;
        }
      }
    }
    if (field === 'text' && rules.length > 0 && container) {
      const lastRule = rules[rules.length - 1];
      const lastSel = (lastRule?.selector ?? '').trim();
      const contTrim = container.trim();
      if (lastSel === contTrim) {
        addError(r, 'text.rules: last rule selector must not equal message.containerSelector (avoids capturing whole block)');
        r.ok = false;
      }
    }
  }

  return r;
}

/** Ensure meta exists; fill id/name/version/updatedAt. Mutates profile. */
export function ensureProfileMeta(profile: ExtractorProfile, filename: string): void {
  const id = filename.replace(/\.json$/, '');
  const now = new Date().toISOString();
  if (!profile.meta) {
    (profile as Record<string, unknown>).meta = {
      id,
      name: id,
      version: 1,
      updatedAt: now,
    };
  } else {
    const meta = profile.meta as Record<string, unknown>;
    if (!meta.id) meta.id = id;
    if (!meta.name) meta.name = id;
    if (typeof meta.version !== 'number') meta.version = 1;
    meta.updatedAt = now;
  }
}
