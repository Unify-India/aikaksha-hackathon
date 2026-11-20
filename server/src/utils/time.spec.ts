import { describe, expect, it } from 'vitest';
import { parseTime, resolveDateText, resolveSchedule, ScheduleError } from './time.js';

// Friday 20 Nov 2026, 09:00 IST
const NOW = '2026-11-20T09:00:00+05:30';
const intent = (slots: Record<string, unknown>) => ({ extractedSlots: slots });

describe('resolveSchedule (Asia/Kolkata)', () => {
  it('resolves the NEET demo sentence: tomorrow 10:00–10:45', () => {
    const s = resolveSchedule(
      intent({ dateText: 'tomorrow', startTime: '10:00', endTime: '10:45', durationMinutes: 45 }),
      NOW,
    );
    expect(s).toEqual({
      date: '2026-11-21',
      startTime: '10:00',
      endTime: '10:45',
      startTimestampMs: Date.UTC(2026, 10, 21, 4, 30), // 10:00 IST = 04:30 UTC
      endTimestampMs: Date.UTC(2026, 10, 21, 5, 15),
    });
  });

  it('accepts 12-hour times', () => {
    const s = resolveSchedule(intent({ dateText: 'tomorrow', startTime: '10:00 AM', endTime: '10:45 am' }), NOW);
    expect(s.startTime).toBe('10:00');
    expect(s.endTime).toBe('10:45');
  });

  it('derives the end from the duration when no end time is spoken', () => {
    const s = resolveSchedule(intent({ dateText: 'tomorrow', startTime: '14:00', durationMinutes: 90 }), NOW);
    expect(s.endTime).toBe('15:30');
    expect(s.endTimestampMs - s.startTimestampMs).toBe(90 * 60_000);
  });

  it('allows a window longer than the duration', () => {
    const s = resolveSchedule(
      intent({ dateText: 'tomorrow', startTime: '10:00', endTime: '11:00', durationMinutes: 45 }),
      NOW,
    );
    expect(s.endTime).toBe('11:00');
  });

  it('rejects a window shorter than the duration instead of guessing', () => {
    expect(() =>
      resolveSchedule(intent({ dateText: 'tomorrow', startTime: '10:00', endTime: '10:30', durationMinutes: 45 }), NOW),
    ).toThrow(expect.objectContaining({ code: 'DURATION_MISMATCH' }));
  });

  it('rejects end before start', () => {
    expect(() => resolveSchedule(intent({ dateText: 'tomorrow', startTime: '11:00', endTime: '10:00' }), NOW)).toThrow(
      expect.objectContaining({ code: 'INVALID_SCHEDULE' }),
    );
  });

  it('rejects a start in the past', () => {
    expect(() => resolveSchedule(intent({ dateText: 'today', startTime: '08:00', durationMinutes: 30 }), NOW)).toThrow(
      expect.objectContaining({ code: 'START_IN_PAST' }),
    );
  });

  it('reports missing pieces with specific codes', () => {
    expect(() => resolveSchedule(intent({ startTime: '10:00' }), NOW)).toThrow(
      expect.objectContaining({ code: 'MISSING_DATE' }),
    );
    expect(() => resolveSchedule(intent({ dateText: 'tomorrow' }), NOW)).toThrow(
      expect.objectContaining({ code: 'MISSING_START_TIME' }),
    );
    expect(() => resolveSchedule(intent({ dateText: 'tomorrow', startTime: '10:00' }), NOW)).toThrow(
      expect.objectContaining({ code: 'MISSING_END' }),
    );
  });

  it('uses the IST calendar date, not the UTC one, late at night', () => {
    // 23:30 IST on 20 Nov is still 20 Nov in IST but 18:00 UTC; "tomorrow" must be 21 Nov.
    const s = resolveSchedule(
      intent({ dateText: 'tomorrow', startTime: '09:00', durationMinutes: 60 }),
      '2026-11-20T18:00:00Z',
    );
    expect(s.date).toBe('2026-11-21');
    expect(s.startTimestampMs).toBe(Date.UTC(2026, 10, 21, 3, 30));
  });

  it('throws ScheduleError instances', () => {
    expect(() => resolveSchedule(intent({}), NOW)).toThrow(ScheduleError);
  });
});

describe('resolveDateText', () => {
  const now = new Date(NOW); // Friday
  const iso = (d: { year: number; month: number; day: number }) =>
    `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

  it.each([
    ['today', '2026-11-20'],
    ['Tomorrow', '2026-11-21'],
    ['day after tomorrow', '2026-11-22'],
    ['in 3 days', '2026-11-23'],
    ['monday', '2026-11-23'],
    ['next Monday', '2026-11-23'],
    ['friday', '2026-11-27'], // a weekday never means today
    ['2026-12-01', '2026-12-01'],
    ['25/11/2026', '2026-11-25'],
    ['25/11', '2026-11-25'],
    ['25 Nov', '2026-11-25'],
    ['November 25th', '2026-11-25'],
    ['5 jan', '2027-01-05'], // already passed this year -> next year
  ])('%s -> %s', (text, expected) => {
    expect(iso(resolveDateText(text, now))).toBe(expected);
  });

  it('rejects nonsense and impossible dates', () => {
    expect(() => resolveDateText('someday', now)).toThrow(expect.objectContaining({ code: 'UNRECOGNISED_DATE' }));
    expect(() => resolveDateText('31/02/2027', now)).toThrow(expect.objectContaining({ code: 'UNRECOGNISED_DATE' }));
  });
});

describe('parseTime', () => {
  it.each([
    ['10:00', 10, 0],
    ['9:30', 9, 30],
    ['10 am', 10, 0],
    ['12 pm', 12, 0],
    ['12:15 AM', 0, 15],
    ['4:45 p.m.', 16, 45],
    ['1030', 10, 30],
  ])('%s', (text, hour, minute) => {
    expect(parseTime(text)).toEqual({ hour, minute });
  });

  it('rejects invalid times', () => {
    expect(() => parseTime('25:00')).toThrow(ScheduleError);
    expect(() => parseTime('13 pm')).toThrow(ScheduleError);
  });
});
