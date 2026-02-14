/**
 * Parse Telegram-style timestamp strings to ISO. Used for meta ts field and lint (TS_PARSE_MISSING / TS_PARSE_FAILED).
 */

/** Match DD.MM.YYYY HH:mm:ss UTC±HH:MM or UTC+HHmm */
const TELEGRAM_TS_REGEX = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\s+UTC([+-])(\d{1,2}):?(\d{2})?/;

/** Rough ISO pattern (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss) */
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}(T|\s)/;

/**
 * Parse ts string to ISO. Supports:
 * - DD.MM.YYYY HH:mm:ss UTC+09:00 (or UTC+09) → ISO in that offset, then normalized to Z or with offset.
 * - Already ISO → return as-is (trimmed).
 * On failure returns null.
 */
export function parseTelegramTitleTs(tsStr: string, tz?: string): string | null {
  const s = (tsStr ?? '').trim();
  if (!s) return null;

  if (ISO_LIKE.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = s.match(TELEGRAM_TS_REGEX);
  if (!m) return null;

  const [, day, month, year, hour, min, sec, sign, tzH, tzM] = m;
  const tzHours = parseInt(tzH ?? '0', 10);
  const tzMinutes = parseInt(tzM ?? '0', 10);
  const offsetMs = (sign === '+' ? 1 : -1) * (tzHours * 3600 + tzMinutes * 60) * 1000;
  const utcMs = Date.UTC(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10),
    parseInt(hour!, 10),
    parseInt(min!, 10),
    parseInt(sec!, 10),
    0
  ) - offsetMs;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
