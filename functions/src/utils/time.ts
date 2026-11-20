/**
 * Robust date and time conversion utility for Indian Standard Time (Asia/Kolkata).
 * Ensures that the LLM never executes fragile date arithmetic.
 */

export interface IResolvedDateTimeWindow {
  date: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  startTimestampMs: number;
  endTimestampMs: number;
}

export interface IRelativeTimeSlotInput {
  dateText?: string; // 'today', 'tomorrow', 'next monday', '2026-11-21', etc.
  startTime?: string; // '10:00', '10:00 AM', '14:30'
  endTime?: string; // '11:00', '11:30'
  durationMinutes?: number; // e.g. 60
}

/**
 * Returns current timestamp formatted in Asia/Kolkata timezone.
 */
export function getNowInKolkata(referenceDate: Date = new Date()): Date {
  const kolkataStr = referenceDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  return new Date(kolkataStr);
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatDateKolkata(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses 12-hour or 24-hour time string into { hours: number, minutes: number }
 */
export function parseTimeString(timeStr?: string): { hours: number; minutes: number } {
  if (!timeStr) {
    return { hours: 10, minutes: 0 }; // Default 10:00 AM
  }

  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  const numericPart = clean.replace(/[^\d:]/g, '');
  const [hPart, mPart] = numericPart.split(':');

  let hours = parseInt(hPart, 10) || 0;
  const minutes = mPart ? parseInt(mPart, 10) || 0 : 0;

  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }

  return { hours: Math.min(23, Math.max(0, hours)), minutes: Math.min(59, Math.max(0, minutes)) };
}

/**
 * Resolves natural language date indications relative to Asia/Kolkata now
 */
export function resolveTargetDate(dateText?: string, referenceDate: Date = new Date()): Date {
  const kolkataNow = getNowInKolkata(referenceDate);
  const target = new Date(kolkataNow.getTime());

  if (!dateText) {
    return target; // default today
  }

  const lower = dateText.toLowerCase().trim();

  if (lower === 'today') {
    return target;
  }

  if (lower === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    return target;
  }

  if (lower === 'day after tomorrow') {
    target.setDate(target.getDate() + 2);
    return target;
  }

  // Check ISO format YYYY-MM-DD
  const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    return new Date(y, m, d);
  }

  // Day of week match (e.g. "next monday", "monday")
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    if (lower.includes(daysOfWeek[i])) {
      const currentDay = target.getDay();
      let diff = i - currentDay;
      if (diff <= 0 || lower.includes('next')) {
        diff += 7;
      }
      target.setDate(target.getDate() + diff);
      return target;
    }
  }

  return target;
}

/**
 * Converts slots into concrete startTimestampMs, endTimestampMs and string formats.
 * All computations enforce Indian Standard Time (+05:30).
 */
export function resolveKolkataTimeWindow(
  slots: IRelativeTimeSlotInput,
  referenceDate: Date = new Date()
): IResolvedDateTimeWindow {
  const targetDate = resolveTargetDate(slots.dateText, referenceDate);
  const startHM = parseTimeString(slots.startTime ?? '10:00');
  const durationMinutes = slots.durationMinutes && slots.durationMinutes > 0 ? slots.durationMinutes : 60;

  // Build ISO string in Asia/Kolkata offset (+05:30)
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  const startHH = String(startHM.hours).padStart(2, '0');
  const startMM = String(startHM.minutes).padStart(2, '0');

  const startIsoString = `${yyyy}-${mm}-${dd}T${startHH}:${startMM}:00+05:30`;
  const startTimestampMs = new Date(startIsoString).getTime();

  let endTimestampMs: number;
  let endHH = '';
  let endMM = '';

  if (slots.endTime) {
    const endHM = parseTimeString(slots.endTime);
    endHH = String(endHM.hours).padStart(2, '0');
    endMM = String(endHM.minutes).padStart(2, '0');
    const endIsoString = `${yyyy}-${mm}-${dd}T${endHH}:${endMM}:00+05:30`;
    endTimestampMs = new Date(endIsoString).getTime();

    // If endTime is before startTime, assume it spans to next day
    if (endTimestampMs <= startTimestampMs) {
      endTimestampMs += 24 * 60 * 60 * 1000;
    }
  } else {
    endTimestampMs = startTimestampMs + durationMinutes * 60 * 1000;
    const endDateObj = new Date(endTimestampMs);
    const endKolkata = getNowInKolkata(endDateObj);
    endHH = String(endKolkata.getHours()).padStart(2, '0');
    endMM = String(endKolkata.getMinutes()).padStart(2, '0');
  }

  const endDateObj = new Date(endTimestampMs);
  const endKolkata = getNowInKolkata(endDateObj);
  const formattedEndDate = formatDateKolkata(endKolkata);
  const formattedStartDate = `${yyyy}-${mm}-${dd}`;

  return {
    date: formattedStartDate,
    endDate: formattedEndDate,
    startTime: `${startHH}:${startMM}`,
    endTime: `${endHH}:${endMM}`,
    startTimestampMs,
    endTimestampMs,
  };
}
