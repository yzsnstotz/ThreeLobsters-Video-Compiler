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

const MONTH_NAMES: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * Parse date-separator text (e.g. "12 February 2026" or "12.02.2026") to DD.MM.YYYY.
 * Returns null if unparseable.
 */
export function parseDateSeparatorToDDMMYYYY(text: string): string | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  const ddmmyyyy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${d!.padStart(2, '0')}.${m!.padStart(2, '0')}.${y}`;
  }
  const parts = s.split(/\s+/);
  if (parts.length >= 3) {
    const day = parts[0].replace(/\D/g, '');
    const monthStr = parts[1].toLowerCase();
    const year = parts[2].replace(/\D/g, '');
    const month = MONTH_NAMES[monthStr] ?? (monthStr.length <= 2 ? monthStr.padStart(2, '0') : null);
    if (day && month && year && year.length === 4) {
      return `${day.padStart(2, '0')}.${month}.${year}`;
    }
  }
  return null;
}

/** Time-only pattern (HH:mm or HH:mm:ss). */
const TIME_ONLY_REGEX = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;

/**
 * Build full Telegram-style ts string from date (DD.MM.YYYY) + time-only (e.g. 13:24) + offset (e.g. UTC+09:00).
 * Seconds default to :00 if missing. Returns string suitable for parseTelegramTitleTs.
 */
export function buildFullTsFromDateAndTime(
  dateDDMMYYYY: string,
  timeOnly: string,
  utcOffsetStr: string
): string {
  const timeMatch = (timeOnly ?? '').trim().match(TIME_ONLY_REGEX);
  const hour = timeMatch?.[1]?.padStart(2, '0') ?? '00';
  const min = timeMatch?.[2]?.padStart(2, '0') ?? '00';
  const sec = (timeMatch?.[3] ?? '0').padStart(2, '0');
  return `${dateDDMMYYYY} ${hour}:${min}:${sec} ${utcOffsetStr}`;
}
