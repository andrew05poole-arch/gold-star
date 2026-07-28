import {
  addLocalDays,
  buildInclusiveLocalDateRange,
  lastNLocalDays,
  localDateKey,
  nextOccurrenceOfWeekday,
  startOfLocalDay,
  utcMondayWeekStart,
} from '../dateRange';

describe('localDateKey', () => {
  it('derives Y-M-D from local calendar fields, not UTC', () => {
    const d = new Date(2026, 0, 5, 23, 30); // Jan 5, 2026, 11:30pm local
    expect(localDateKey(d)).toBe('2026-01-05');
  });

  it('zero-pads single-digit month and day', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 10, 25))).toBe('2026-11-25');
  });
});

describe('startOfLocalDay', () => {
  it('zeroes the time components without changing the calendar day', () => {
    const d = startOfLocalDay(new Date(2026, 5, 15, 18, 45, 30));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(localDateKey(d)).toBe('2026-06-15');
  });
});

describe('addLocalDays', () => {
  it('rolls forward across a month boundary', () => {
    expect(localDateKey(addLocalDays(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
  });

  it('rolls backward across a month boundary', () => {
    expect(localDateKey(addLocalDays(new Date(2026, 1, 1), -1))).toBe('2026-01-31');
  });

  it('rolls forward across a year boundary', () => {
    expect(localDateKey(addLocalDays(new Date(2026, 11, 31), 1))).toBe('2027-01-01');
  });
});

describe('buildInclusiveLocalDateRange', () => {
  it('includes both the start and end date', () => {
    const days = buildInclusiveLocalDateRange(new Date(2026, 5, 1), new Date(2026, 5, 3));
    expect(days.map(localDateKey)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('returns exactly one day when start equals end', () => {
    const d = new Date(2026, 5, 1);
    expect(buildInclusiveLocalDateRange(d, d).map(localDateKey)).toEqual(['2026-06-01']);
  });
});

describe('lastNLocalDays', () => {
  it('returns exactly rangeDays days ending on "now"', () => {
    const now = new Date(2026, 6, 27);
    const { startDate, endDate } = lastNLocalDays(7, now);
    expect(localDateKey(endDate)).toBe('2026-07-27');
    expect(localDateKey(startDate)).toBe('2026-07-21');
    expect(buildInclusiveLocalDateRange(startDate, endDate)).toHaveLength(7);
  });
});

/** Finds a real Monday near `around` via the platform's own Date, rather than hardcoding a claim about which weekday a specific date falls on (fragile and easy to get wrong by hand). */
function findMonday(around: Date): Date {
  const d = new Date(around);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

describe('nextOccurrenceOfWeekday', () => {
  it('returns today when today already matches the target weekday', () => {
    const today = new Date(2026, 6, 15);
    expect(localDateKey(nextOccurrenceOfWeekday(today.getDay(), today))).toBe(localDateKey(today));
  });

  it('returns a date within the next 7 days whose weekday matches the target, for every possible target', () => {
    const today = new Date(2026, 6, 15);
    for (let targetDow = 0; targetDow <= 6; targetDow++) {
      const result = nextOccurrenceOfWeekday(targetDow, today);
      expect(result.getDay()).toBe(targetDow);
      const daysAhead = Math.round((startOfLocalDay(result).getTime() - startOfLocalDay(today).getTime()) / 86_400_000);
      expect(daysAhead).toBeGreaterThanOrEqual(0);
      expect(daysAhead).toBeLessThan(7);
    }
  });

  it('never returns a date before today', () => {
    const today = new Date(2026, 6, 15);
    const dayBeforeToday = (today.getDay() + 6) % 7; // yesterday's weekday — the "worst case" (furthest back)
    const result = nextOccurrenceOfWeekday(dayBeforeToday, today);
    expect(result.getTime()).toBeGreaterThanOrEqual(startOfLocalDay(today).getTime());
  });
});

describe('utcMondayWeekStart', () => {
  it("anchors to the Monday of the ISO week, matching the SQL date_trunc('week', ...) convention", () => {
    const monday = findMonday(new Date(2026, 6, 1));
    const mondayKey = localDateKey(monday);

    expect(utcMondayWeekStart(mondayKey)).toBe(mondayKey);
    // Sunday, 6 days later, is the LAST day of that same week.
    expect(utcMondayWeekStart(localDateKey(addLocalDays(monday, 6)))).toBe(mondayKey);
    // The following Monday starts a new week.
    const nextMondayKey = localDateKey(addLocalDays(monday, 7));
    expect(utcMondayWeekStart(nextMondayKey)).toBe(nextMondayKey);
  });
});
