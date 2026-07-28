import {
  calculateHistoricalStepSummary,
  classifyMovementProfile,
  estimateStarterLeague,
  suggestDailyGoal,
} from '../stepHistorySummary';
import { addLocalDays, localDateKey } from '../dateRange';
import type { StepDay } from '../types';

function day(date: string, rawSteps: number): StepDay {
  return { date, rawSteps, normalizedSteps: rawSteps };
}

describe('calculateHistoricalStepSummary', () => {
  it('computes total and average over dense data', () => {
    const summary = calculateHistoricalStepSummary({
      records: [day('2026-01-01', 1000), day('2026-01-02', 2000), day('2026-01-03', 3000)],
      periodStart: '2026-01-01',
      periodEnd: '2026-01-03',
      now: new Date(2026, 0, 4),
    });
    expect(summary.daysWithData).toBe(3);
    expect(summary.totalSteps).toBe(6000);
    expect(summary.averageDailySteps).toBe(2000);
  });

  it('never treats missing days as zero — an empty history has null averages, not a misleading 0', () => {
    const summary = calculateHistoricalStepSummary({
      records: [],
      periodStart: '2026-01-01',
      periodEnd: '2026-01-01',
      now: new Date(2026, 0, 2),
    });
    expect(summary.daysWithData).toBe(0);
    expect(summary.averageDailySteps).toBeNull();
    expect(summary.bestDay).toBeNull();
    expect(summary.weekdayAverage).toBeNull();
    expect(summary.weekendAverage).toBeNull();
    expect(summary.suggestedDailyGoal).toBeNull();
    expect(summary.movementProfile).toBeNull();
  });

  it('avoids divide-by-zero: weekOverWeekPercent is null when the previous week has no data', () => {
    const summary = calculateHistoricalStepSummary({
      records: [day('2026-01-05', 5000)],
      periodStart: '2026-01-05',
      periodEnd: '2026-01-05',
      now: new Date(2026, 0, 6),
    });
    expect(summary.previousWeekSteps).toBe(0);
    expect(summary.weekOverWeekPercent).toBeNull();
  });

  it('picks the max as bestDay, and the earliest date wins a tie', () => {
    const summary = calculateHistoricalStepSummary({
      records: [day('2026-01-01', 5000), day('2026-01-02', 9000), day('2026-01-03', 9000)],
      periodStart: '2026-01-01',
      periodEnd: '2026-01-03',
      now: new Date(2026, 0, 4),
    });
    expect(summary.bestDay).toEqual({ date: '2026-01-02', steps: 9000 });
  });

  it('computes week-over-week percent between two real, distinct UTC-Monday weeks', () => {
    const thisMonday = findMonday(new Date(2026, 5, 1));
    const lastMonday = addLocalDays(thisMonday, -7);
    const now = addLocalDays(thisMonday, 2);

    const records: StepDay[] = [
      day(localDateKey(lastMonday), 4000),
      day(localDateKey(addLocalDays(lastMonday, 1)), 4000),
      day(localDateKey(thisMonday), 5000),
      day(localDateKey(addLocalDays(thisMonday, 1)), 5000),
    ];

    const summary = calculateHistoricalStepSummary({
      records,
      periodStart: records[0].date,
      periodEnd: records[records.length - 1].date,
      now,
    });

    expect(summary.previousWeekSteps).toBe(8000);
    expect(summary.currentWeekSteps).toBe(10000);
    expect(summary.weekOverWeekPercent).toBe(25);
  });

  it('classifies weekend_warrior when weekend average sufficiently exceeds weekday average with enough data in both', () => {
    const saturday = findSaturday(new Date(2026, 2, 1));
    const sunday = addLocalDays(saturday, 1);
    const records: StepDay[] = [
      day(localDateKey(addLocalDays(saturday, -5)), 4000),
      day(localDateKey(addLocalDays(saturday, -4)), 4200),
      day(localDateKey(addLocalDays(saturday, -3)), 3800),
      day(localDateKey(saturday), 9000),
      day(localDateKey(sunday), 9200),
    ];
    const summary = calculateHistoricalStepSummary({
      records,
      periodStart: records[0].date,
      periodEnd: records[records.length - 1].date,
      now: addLocalDays(sunday, 1),
    });
    expect(summary.weekdayAverage).toBe(4000);
    expect(summary.weekendAverage).toBe(9100);
    expect(summary.movementProfile?.key).toBe('weekend_warrior');
  });
});

describe('suggestDailyGoal', () => {
  it('returns null with fewer than 3 days of data (mirrors the PRD §13.3 new-user rule)', () => {
    expect(suggestDailyGoal(8000, 2)).toBeNull();
  });

  it('returns null when there is no average to work from', () => {
    expect(suggestDailyGoal(null, 10)).toBeNull();
  });

  it('grows the average by 5% and rounds to the nearest 500', () => {
    expect(suggestDailyGoal(8000, 10)).toBe(8500); // 8000 * 1.05 = 8400 -> 8500
  });

  it('clamps to the 3,000-step minimum', () => {
    expect(suggestDailyGoal(500, 10)).toBe(3000);
  });

  it('clamps to the 15,000-step maximum', () => {
    expect(suggestDailyGoal(20000, 10)).toBe(15000);
  });
});

describe('classifyMovementProfile', () => {
  it('returns null with zero days of data', () => {
    expect(
      classifyMovementProfile({
        daysWithData: 0,
        averageDailySteps: null,
        weekdayAverage: null,
        weekendAverage: null,
        weekdayCount: 0,
        weekendCount: 0,
      }),
    ).toBeNull();
  });

  it('returns getting_started with fewer than 3 days', () => {
    const result = classifyMovementProfile({
      daysWithData: 2,
      averageDailySteps: 5000,
      weekdayAverage: 5000,
      weekendAverage: null,
      weekdayCount: 2,
      weekendCount: 0,
    });
    expect(result?.key).toBe('getting_started');
  });

  it('returns high_volume_walker at or above the threshold', () => {
    const result = classifyMovementProfile({
      daysWithData: 5,
      averageDailySteps: 12000,
      weekdayAverage: 12000,
      weekendAverage: 12000,
      weekdayCount: 3,
      weekendCount: 2,
    });
    expect(result?.key).toBe('high_volume_walker');
  });

  it('returns building_momentum below the threshold with no strong weekday/weekend skew', () => {
    const result = classifyMovementProfile({
      daysWithData: 5,
      averageDailySteps: 3000,
      weekdayAverage: 3000,
      weekendAverage: 3000,
      weekdayCount: 3,
      weekendCount: 2,
    });
    expect(result?.key).toBe('building_momentum');
  });

  it('returns steady_mover as the baseline case', () => {
    const result = classifyMovementProfile({
      daysWithData: 5,
      averageDailySteps: 7000,
      weekdayAverage: 7000,
      weekendAverage: 7000,
      weekdayCount: 3,
      weekendCount: 2,
    });
    expect(result?.key).toBe('steady_mover');
  });

  it('does not classify a weekend/weekday skew without enough data in both buckets', () => {
    // Only 1 weekend day — below MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT (2) —
    // so weekend_warrior must not trigger even though the ratio would qualify.
    const result = classifyMovementProfile({
      daysWithData: 4,
      averageDailySteps: 5000,
      weekdayAverage: 4000,
      weekendAverage: 9000,
      weekdayCount: 3,
      weekendCount: 1,
    });
    expect(result?.key).not.toBe('weekend_warrior');
  });
});

describe('estimateStarterLeague', () => {
  it('always returns null — no benchmark/league dataset exists in the schema yet', () => {
    expect(estimateStarterLeague({ averageDailySteps: 9000 })).toBeNull();
  });
});

function findMonday(around: Date): Date {
  const d = new Date(around);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

function findSaturday(around: Date): Date {
  const d = new Date(around);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d;
}
