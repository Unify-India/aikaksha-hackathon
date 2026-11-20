/**
 * Server-side schedule resolution. The model only returns the words ("tomorrow", "10:00");
 * all date maths happens here, in the institute's time zone (default Asia/Kolkata).
 *
 * Owner: Sakshi.
 */
import type { IVoiceIntent } from '../types/voice-intent.js';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export type ScheduleErrorCode =
  | 'MISSING_DATE'
  | 'UNRECOGNISED_DATE'
  | 'MISSING_START_TIME'
  | 'INVALID_TIME'
  | 'MISSING_END'
  | 'INVALID_SCHEDULE'
  | 'DURATION_MISMATCH'
  | 'START_IN_PAST'
  | 'WEEKDAY_MISMATCH';

export class ScheduleError extends Error {
  constructor(
    public readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleError';
  }
}

export interface ResolvedSchedule {
  /** Local date in the institute time zone, YYYY-MM-DD. */
  date: string;
  /** Local start time, HH:mm (24h). */
  startTime: string;
  /** Local end time, HH:mm (24h). */
  endTime: string;
  startTimestampMs: number;
  endTimestampMs: number;
}

interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * Resolves the intent's spoken date/time words to a concrete window.
 *
 * Rules:
 * - End comes from `endTime`, or from `startTime + durationMinutes` when no end was spoken.
 * - If both are given and the window is shorter than the duration -> DURATION_MISMATCH
 *   (ask the teacher; never silently pick one). A longer window is allowed.
 * - Start must be in the future.
 */
export function resolveSchedule(
  intent: Pick<IVoiceIntent, 'extractedSlots'>,
  nowIso: string,
  timezone: string = DEFAULT_TIMEZONE,
): ResolvedSchedule {
  const slots = intent.extractedSlots;
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) throw new RangeError(`Invalid nowIso: ${nowIso}`);

  const dateWords = slots.dateText ?? slots.scheduledDate;
  if (!dateWords) throw new ScheduleError('MISSING_DATE', 'No exam date was given.');
  const date = resolveDateText(dateWords, now, timezone);

  if (!slots.startTime) throw new ScheduleError('MISSING_START_TIME', 'No start time was given.');
  const start = parseTime(slots.startTime);
  const startTimestampMs = zonedToEpochMs(date, start.hour, start.minute, timezone);

  let endTimestampMs: number;
  if (slots.endTime) {
    const end = parseTime(slots.endTime);
    endTimestampMs = zonedToEpochMs(date, end.hour, end.minute, timezone);
    if (endTimestampMs <= startTimestampMs) {
      throw new ScheduleError('INVALID_SCHEDULE', 'End time must be after start time.');
    }
    const windowMinutes = (endTimestampMs - startTimestampMs) / 60_000;
    if (slots.durationMinutes !== undefined && windowMinutes < slots.durationMinutes) {
      throw new ScheduleError(
        'DURATION_MISMATCH',
        `The window ${slots.startTime}–${slots.endTime} is ${windowMinutes} min, shorter than the ${slots.durationMinutes}-min duration.`,
      );
    }
  } else if (slots.durationMinutes !== undefined && slots.durationMinutes > 0) {
    endTimestampMs = startTimestampMs + slots.durationMinutes * 60_000;
  } else {
    throw new ScheduleError('MISSING_END', 'Neither an end time nor a duration was given.');
  }

  if (startTimestampMs <= now.getTime()) {
    throw new ScheduleError('START_IN_PAST', 'The start time is in the past.');
  }

  return {
    date: formatDate(date),
    startTime: formatLocalTime(startTimestampMs, timezone),
    endTime: formatLocalTime(endTimestampMs, timezone),
    startTimestampMs,
    endTimestampMs,
  };
}

// ---------------------------------------------------------------------------
// Date words
// ---------------------------------------------------------------------------

/**
 * Understands: today, tomorrow, day after tomorrow, "in N days", weekdays
 * ("friday", "this friday", "next friday" = the coming one, never today),
 * ISO "2026-11-21", "21/11/2026", "21/11", "21 Nov", "Nov 21", "21st November 2026".
 */
export function resolveDateText(text: string, now: Date, timezone: string = DEFAULT_TIMEZONE): LocalDate {
  const today = localDateOf(now, timezone);
  const t = text.trim().toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ');

  if (t === 'today' || t === 'aaj') return today;
  if (t === 'tomorrow' || t === 'kal') return addDays(today, 1);
  if (t === 'day after tomorrow' || t === 'parso' || t === 'parson') return addDays(today, 2);

  const inDays = /^in (\d{1,3}) days?$/.exec(t);
  if (inDays?.[1]) return addDays(today, Number(inDays[1]));

  const weekday = /^(?:(?:this|next|coming|on) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(t);
  if (weekday?.[1]) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const current = dayOfWeek(today);
    const ahead = ((target - current + 7) % 7) || 7;
    return addDays(today, ahead);
  }

  // "Monday, 22 November 2026": a weekday in front of an explicit date. The date wins, but only if they agree.
  const dayAndDate = /^(?:on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday) (.+)$/.exec(t);
  if (dayAndDate?.[1] && dayAndDate[2]) {
    const date = resolveDateText(dayAndDate[2], now, timezone);
    const actual = WEEKDAYS[dayOfWeek(date)] ?? '';
    if (actual !== dayAndDate[1]) {
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      throw new ScheduleError(
        'WEEKDAY_MISMATCH',
        `${date.day} ${cap(MONTHS[date.month - 1] ?? '')} ${date.year} is a ${cap(actual)}, not a ${cap(dayAndDate[1])}. Which date did you mean?`,
      );
    }
    return date;
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), text);

  const dmy = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(t);
  if (dmy) {
    const year = dmy[3] ? normaliseYear(Number(dmy[3])) : undefined;
    return withYear(Number(dmy[1]), Number(dmy[2]), year, today, text);
  }

  const dayMonth = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(t);
  if (dayMonth?.[2]) {
    const month = monthIndex(dayMonth[2]);
    if (month) return withYear(Number(dayMonth[1]), month, dayMonth[3] ? Number(dayMonth[3]) : undefined, today, text);
  }

  const monthDay = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t);
  if (monthDay?.[1]) {
    const month = monthIndex(monthDay[1]);
    if (month) return withYear(Number(monthDay[2]), month, monthDay[3] ? Number(monthDay[3]) : undefined, today, text);
  }

  throw new ScheduleError('UNRECOGNISED_DATE', `Could not understand the date "${text}".`);
}

/** "10:00", "9:30", "10 am", "10:30 PM", "1030" -> 24h hour/minute. */
export function parseTime(text: string): { hour: number; minute: number } {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m?.[1]) throw new ScheduleError('INVALID_TIME', `Could not understand the time "${text}".`);
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3];
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new ScheduleError('INVALID_TIME', `Invalid time "${text}".`);
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
  }
  if (hour > 23 || minute > 59) throw new ScheduleError('INVALID_TIME', `Invalid time "${text}".`);
  return { hour, minute };
}

// ---------------------------------------------------------------------------
// Time-zone maths (works for any IANA zone; Asia/Kolkata has no DST)
// ---------------------------------------------------------------------------

/** Converts a wall-clock time in `timezone` to epoch ms. */
export function zonedToEpochMs(date: LocalDate, hour: number, minute: number, timezone: string): number {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let result = asUtc - offsetMs(asUtc, timezone);
  // Second pass corrects for an offset change between the guess and the result (DST edges).
  result = asUtc - offsetMs(result, timezone);
  return result;
}

/** Offset of `timezone` from UTC at instant `epochMs` (e.g. +19_800_000 for IST). */
function offsetMs(epochMs: number, timezone: string): number {
  const p = zonedParts(epochMs, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

function zonedParts(epochMs: number, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(fmt.formatToParts(new Date(epochMs)).find((x) => x.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function localDateOf(now: Date, timezone: string): LocalDate {
  const p = zonedParts(now.getTime(), timezone);
  return { year: p.year, month: p.month, day: p.day };
}

function formatLocalTime(epochMs: number, timezone: string): string {
  const p = zonedParts(epochMs, timezone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// ---------------------------------------------------------------------------
// Small date helpers
// ---------------------------------------------------------------------------

function addDays(d: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

function dayOfWeek(d: LocalDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function monthIndex(word: string): number | undefined {
  const i = MONTHS.findIndex((m) => word.length >= 3 && m.startsWith(word));
  return i === -1 ? undefined : i + 1;
}

function normaliseYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/** A date with no year means the next time that day comes round (today counts). */
function withYear(day: number, month: number, year: number | undefined, today: LocalDate, text: string): LocalDate {
  if (year !== undefined) return validDate(year, month, day, text);
  const thisYear = validDate(today.year, month, day, text);
  return compare(thisYear, today) >= 0 ? thisYear : validDate(today.year + 1, month, day, text);
}

function validDate(year: number, month: number, day: number, text: string): LocalDate {
  const t = new Date(Date.UTC(year, month - 1, day));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) {
    throw new ScheduleError('UNRECOGNISED_DATE', `"${text}" is not a valid date.`);
  }
  return { year, month, day };
}

function compare(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function formatDate(d: LocalDate): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
