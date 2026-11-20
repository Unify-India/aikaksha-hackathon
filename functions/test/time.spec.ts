import { describe, expect, it } from 'vitest';
import { parseTimeString, resolveKolkataTimeWindow } from '../src/utils/time.js';

// A fixed "now": 2026-11-20 14:00 IST (08:30 UTC)
const NOW = new Date('2026-11-20T14:00:00+05:30');

const ist = (iso: string): number => new Date(`${iso}+05:30`).getTime();

describe('parseTimeString', () => {
  it('parses 24-hour and 12-hour times', () => {
    expect(parseTimeString('14:30')).toEqual({ hours: 14, minutes: 30 });
    expect(parseTimeString('10:00 AM')).toEqual({ hours: 10, minutes: 0 });
    expect(parseTimeString('10 PM')).toEqual({ hours: 22, minutes: 0 });
    expect(parseTimeString('12:00 AM')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeString('12:30 PM')).toEqual({ hours: 12, minutes: 30 });
  });

  it('defaults to 10:00 when empty', () => {
    expect(parseTimeString(undefined)).toEqual({ hours: 10, minutes: 0 });
  });
});

describe('resolveKolkataTimeWindow (the demo sentence: tomorrow 10:00-10:45)', () => {
  it('resolves "tomorrow" 10:00-10:45 to the right epoch milliseconds', () => {
    const w = resolveKolkataTimeWindow(
      { dateText: 'tomorrow', startTime: '10:00 AM', endTime: '10:45 AM' },
      NOW,
    );
    expect(w.date).toBe('2026-11-21');
    expect(w.startTimestampMs).toBe(ist('2026-11-21T10:00:00'));
    expect(w.endTimestampMs).toBe(ist('2026-11-21T10:45:00'));
    expect(w.endTimestampMs - w.startTimestampMs).toBe(45 * 60 * 1000);
  });

  it('uses duration when no end time is given', () => {
    const w = resolveKolkataTimeWindow(
      { dateText: 'tomorrow', startTime: '10:00', durationMinutes: 45 },
      NOW,
    );
    expect(w.endTimestampMs).toBe(ist('2026-11-21T10:45:00'));
    expect(w.endTime).toBe('10:45');
  });

  it('accepts an explicit ISO date', () => {
    const w = resolveKolkataTimeWindow(
      { dateText: '2026-12-01', startTime: '09:30', endTime: '10:15' },
      NOW,
    );
    expect(w.date).toBe('2026-12-01');
    expect(w.startTimestampMs).toBe(ist('2026-12-01T09:30:00'));
  });

  it('is based on India time, not UTC (late-evening UTC is already tomorrow in IST)', () => {
    // 2026-11-20 20:00 UTC = 2026-11-21 01:30 IST, so "tomorrow" is 2026-11-22
    const lateUtc = new Date('2026-11-20T20:00:00Z');
    const w = resolveKolkataTimeWindow({ dateText: 'tomorrow', startTime: '10:00' }, lateUtc);
    expect(w.date).toBe('2026-11-22');
    expect(w.startTimestampMs).toBe(ist('2026-11-22T10:00:00'));
  });

  it('rolls an end time earlier than the start into the next day', () => {
    const w = resolveKolkataTimeWindow(
      { dateText: 'today', startTime: '23:30', endTime: '00:15' },
      NOW,
    );
    expect(w.endTimestampMs).toBe(ist('2026-11-21T00:15:00'));
    expect(w.endDate).toBe('2026-11-21');
  });
});
