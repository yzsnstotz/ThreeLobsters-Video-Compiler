/**
 * Triggers: error / permission / action. Only error triggers are used for segmentation.
 * Window params for error: pre=6, post=12 (fixed in rules).
 */

export const SEGMENT_WINDOW_PRE = 6;
export const SEGMENT_WINDOW_POST = 12;

export type TriggerCategory = 'error' | 'permission' | 'action';

export interface TriggerDef {
  id: string;
  category: TriggerCategory;
  pattern: RegExp;
}

/** Error triggers (used for segmentation). Order fixed. */
const ERROR_TRIGGERS: TriggerDef[] = [
  { id: 'error.cors', category: 'error', pattern: /CORS|cross-origin/i },
  { id: 'error.401', category: 'error', pattern: /401|Unauthorized/i },
  { id: 'error.403', category: 'error', pattern: /403|Forbidden/i },
  { id: 'error.404', category: 'error', pattern: /404|Not Found/i },
  { id: 'error.timeout', category: 'error', pattern: /timeout|timed out/i },
  { id: 'error.invalid_config', category: 'error', pattern: /Invalid config|invalid configuration/i },
];

const PERMISSION_TRIGGERS: TriggerDef[] = [
  { id: 'perm.allow', category: 'permission', pattern: /\ballow\b/i },
  { id: 'perm.approve', category: 'permission', pattern: /\bapprove\b/i },
  { id: 'perm.grant', category: 'permission', pattern: /\bgrant\b/i },
  { id: 'perm.permission', category: 'permission', pattern: /\bpermission\b/i },
];

const ACTION_TRIGGERS: TriggerDef[] = [
  { id: 'action.curl', category: 'action', pattern: /\bcurl\b/i },
  { id: 'action.openclaw', category: 'action', pattern: /\bopenclaw\b/i },
  { id: 'action.env', category: 'action', pattern: /\benv\b.*\bexport\b|\bexport\b.*\benv\b/i },
  { id: 'action.header', category: 'action', pattern: /\bheader\b|-H\s+/i },
  { id: 'action.ssh', category: 'action', pattern: /\bssh\b/i },
  { id: 'action.gateway', category: 'action', pattern: /gateway\s+status/i },
  { id: 'action.doctor', category: 'action', pattern: /\bdoctor\b/i },
];

export const ALL_TRIGGERS: TriggerDef[] = [
  ...ERROR_TRIGGERS,
  ...PERMISSION_TRIGGERS,
  ...ACTION_TRIGGERS,
];

export const ERROR_TRIGGERS_LIST: TriggerDef[] = ERROR_TRIGGERS;

export function getErrorTriggers(): TriggerDef[] {
  return ERROR_TRIGGERS_LIST;
}

export function matchTriggers(text: string): { id: string; category: TriggerCategory }[] {
  const out: { id: string; category: TriggerCategory }[] = [];
  for (const t of ALL_TRIGGERS) {
    if (t.pattern.test(text)) {
      out.push({ id: t.id, category: t.category });
      t.pattern.lastIndex = 0;
    }
  }
  return out;
}

export function matchErrorTriggers(text: string): string[] {
  const ids: string[] = [];
  for (const t of ERROR_TRIGGERS_LIST) {
    if (t.pattern.test(text)) {
      ids.push(t.id);
      t.pattern.lastIndex = 0;
    }
  }
  return ids;
}
