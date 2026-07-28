/**
 * Pure calculations over imported historical step data: the onboarding
 * "movement summary", a starter daily-goal suggestion, and a deterministic
 * movement-profile classification. No side effects, no I/O — see
 * lib/historicalStepImport.ts for the service that calls these against real
 * data and persists results.
 *
 * Unit choice: every calculation here uses `rawSteps`, not `normalizedSteps`.
 * `profiles.daily_goal` (what `suggestedDailyGoal` ultimately feeds) is
 * compared against `raw_steps` server-side, not `normalized_steps` — see
 * `recompute_streak()`'s `v_today_raw`/`v_floor` comparison in
 * supabase/migrations/0001_init.sql — so a goal suggestion computed from
 * normalized steps would be comparing the wrong units. The example copy in
 * the feature spec ("You averaged 7,842 steps per day") also reads as a raw
 * pedometer count, not a stride-normalized one.
 */
import type { HistoricalStepSummary, MovementProfile, MovementProfileKey, StepDay } from './types';
import { utcMondayWeekStart } from './dateRange';

const MIN_DAYS_FOR_GOAL_SUGGESTION = 3; // mirrors docs/PRD.md §13.3's "new users with <3 days of data get a gentle default target"
const MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT = 2; // "sufficient data in both categories"
const SUGGESTED_GOAL_MIN = 3000;
const SUGGESTED_GOAL_MAX = 15000;
const SUGGESTED_GOAL_GROWTH = 1.05;
const HIGH_VOLUME_THRESHOLD = 11000;
const BUILDING_MOMENTUM_THRESHOLD = 5000;
const WEEKEND_WEEKDAY_SKEW_RATIO = 1.25;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function roundToNearest500(n: number): number {
  return Math.round(n / 500) * 500;
}

function localDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).getDay(); // 0 Sun .. 6 Sat, local — classification only, not an instant
}

/** Conservative, explainable starter-goal suggestion — a game/engagement target, not medical guidance. Null when there isn't enough history to trust an average. */
export function suggestDailyGoal(averageDailySteps: number | null, daysWithData: number): number | null {
  if (averageDailySteps === null || daysWithData < MIN_DAYS_FOR_GOAL_SUGGESTION) return null;
  const grown = roundToNearest500(averageDailySteps * SUGGESTED_GOAL_GROWTH);
  return Math.min(SUGGESTED_GOAL_MAX, Math.max(SUGGESTED_GOAL_MIN, grown));
}

/**
 * Always returns `null` today. StepLeague has no league-tier or benchmark
 * population dataset (no seeded percentiles, no "average user" comparison
 * set) — only this one user's own trailing history exists anywhere in the
 * schema. Fabricating a league name or percentile without real benchmark
 * data would misrepresent the estimate as more meaningful than it is; the
 * interface is defined now so a future migration adding real benchmark data
 * has a natural place to plug in.
 */
export function estimateStarterLeague(_summary: Pick<HistoricalStepSummary, 'averageDailySteps'>): string | null {
  return null;
}

const PROFILE_COPY: Record<MovementProfileKey, (ctx: Record<string, number>) => Omit<MovementProfile, 'key'>> = {
  getting_started: () => ({
    displayName: 'Getting Started',
    explanation: "We don't have enough history yet to spot a pattern — that's normal for a brand-new account.",
  }),
  building_momentum: (ctx) => ({
    displayName: 'Building Momentum',
    explanation: `You're averaging ${Math.round(ctx.averageDailySteps).toLocaleString()} steps a day — every day you track from here raises that baseline.`,
  }),
  high_volume_walker: (ctx) => ({
    displayName: 'High-Volume Walker',
    explanation: `You're averaging ${Math.round(ctx.averageDailySteps).toLocaleString()} steps a day — well above a typical daily goal.`,
  }),
  weekend_warrior: (ctx) => ({
    displayName: 'Weekend Warrior',
    explanation: `Your weekends average ${Math.round(ctx.weekendAverage).toLocaleString()} steps vs. ${Math.round(ctx.weekdayAverage).toLocaleString()} on weekdays.`,
  }),
  weekday_grinder: (ctx) => ({
    displayName: 'Weekday Grinder',
    explanation: `Your weekdays average ${Math.round(ctx.weekdayAverage).toLocaleString()} steps vs. ${Math.round(ctx.weekendAverage).toLocaleString()} on weekends.`,
  }),
  steady_mover: (ctx) => ({
    displayName: 'Steady Mover',
    explanation: `You've kept a consistent pace — around ${Math.round(ctx.averageDailySteps).toLocaleString()} steps most days.`,
  }),
};

/**
 * Deterministic, rules-based classification (no LLM) — same inputs always
 * produce the same profile. Checked in order; first match wins. Returns
 * `null` only when there's truly no data to classify from.
 */
export function classifyMovementProfile(params: {
  daysWithData: number;
  averageDailySteps: number | null;
  weekdayAverage: number | null;
  weekendAverage: number | null;
  weekdayCount: number;
  weekendCount: number;
}): MovementProfile | null {
  const { daysWithData, averageDailySteps, weekdayAverage, weekendAverage, weekdayCount, weekendCount } = params;

  let key: MovementProfileKey;
  if (daysWithData === 0) {
    return null;
  } else if (daysWithData < MIN_DAYS_FOR_GOAL_SUGGESTION) {
    key = 'getting_started';
  } else if (averageDailySteps !== null && averageDailySteps >= HIGH_VOLUME_THRESHOLD) {
    key = 'high_volume_walker';
  } else if (
    weekendAverage !== null &&
    weekdayAverage !== null &&
    weekendCount >= MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT &&
    weekdayCount >= MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT &&
    weekendAverage >= weekdayAverage * WEEKEND_WEEKDAY_SKEW_RATIO
  ) {
    key = 'weekend_warrior';
  } else if (
    weekdayAverage !== null &&
    weekendAverage !== null &&
    weekdayCount >= MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT &&
    weekendCount >= MIN_DAYS_PER_BUCKET_FOR_WEEKDAY_SPLIT &&
    weekdayAverage >= weekendAverage * WEEKEND_WEEKDAY_SKEW_RATIO
  ) {
    key = 'weekday_grinder';
  } else if (averageDailySteps !== null && averageDailySteps < BUILDING_MOMENTUM_THRESHOLD) {
    key = 'building_momentum';
  } else {
    key = 'steady_mover';
  }

  const copy = PROFILE_COPY[key]({
    averageDailySteps: averageDailySteps ?? 0,
    weekdayAverage: weekdayAverage ?? 0,
    weekendAverage: weekendAverage ?? 0,
  });
  return { key, ...copy };
}

/**
 * Builds the full onboarding summary from imported records plus the
 * requested period bounds (period bounds come from the query, not just
 * `records`' min/max date, so a summary still reports "last 30 days" even
 * when a few days inside that range have no data — see daysWithData for the
 * actual count of days that DO have data).
 */
export function calculateHistoricalStepSummary(params: {
  records: StepDay[];
  periodStart: string;
  periodEnd: string;
  now: Date;
}): HistoricalStepSummary {
  const { records, periodStart, periodEnd, now } = params;
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const daysWithData = sorted.length;
  const totalSteps = sorted.reduce((sum, r) => sum + r.rawSteps, 0);
  const averageDailySteps = daysWithData > 0 ? Math.round(totalSteps / daysWithData) : null;

  let bestDay: HistoricalStepSummary['bestDay'] = null;
  for (const r of sorted) {
    if (!bestDay || r.rawSteps > bestDay.steps) bestDay = { date: r.date, steps: r.rawSteps };
  }

  const weekdayValues: number[] = [];
  const weekendValues: number[] = [];
  for (const r of sorted) {
    const dow = localDayOfWeek(r.date);
    (dow === 0 || dow === 6 ? weekendValues : weekdayValues).push(r.rawSteps);
  }
  const weekdayAverage = average(weekdayValues);
  const weekendAverage = average(weekendValues);

  // "This week" is anchored to `now` (today), matching get_leaderboard's own
  // "current ISO week" semantics — not to periodEnd, which (by design, see
  // lib/historicalStepImport.ts) is always yesterday, one day behind `now`.
  const currentWeekKey = utcMondayWeekStart(todayKey(now));
  const previousWeekKey = shiftDateKey(currentWeekKey, -7);
  const currentWeekRecords = sorted.filter((r) => utcMondayWeekStart(r.date) === currentWeekKey);
  const previousWeekRecords = sorted.filter((r) => utcMondayWeekStart(r.date) === previousWeekKey);
  const currentWeekSteps = currentWeekRecords.reduce((sum, r) => sum + r.rawSteps, 0);
  const previousWeekSteps = previousWeekRecords.reduce((sum, r) => sum + r.rawSteps, 0);
  const weekOverWeekPercent =
    previousWeekSteps > 0 ? Math.round(((currentWeekSteps - previousWeekSteps) / previousWeekSteps) * 100) : null;

  const suggestedDailyGoal = suggestDailyGoal(averageDailySteps, daysWithData);
  const movementProfile = classifyMovementProfile({
    daysWithData,
    averageDailySteps,
    weekdayAverage,
    weekendAverage,
    weekdayCount: weekdayValues.length,
    weekendCount: weekendValues.length,
  });

  const summary: HistoricalStepSummary = {
    periodStart,
    periodEnd,
    daysWithData,
    totalSteps,
    averageDailySteps,
    currentWeekSteps,
    previousWeekSteps,
    weekOverWeekPercent,
    bestDay,
    weekdayAverage: weekdayAverage !== null ? Math.round(weekdayAverage) : null,
    weekendAverage: weekendAverage !== null ? Math.round(weekendAverage) : null,
    suggestedDailyGoal,
    estimatedLeague: null,
    movementProfile,
  };
  summary.estimatedLeague = estimateStarterLeague(summary);
  return summary;
}

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
