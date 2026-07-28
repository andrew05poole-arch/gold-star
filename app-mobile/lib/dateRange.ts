/**
 * Date/timezone rules for historical step import.
 *
 * These rules are new (no prior convention existed for multi-day ranges — see
 * historicalStepImport.ts) and deliberately differ from the existing
 * `.toISOString().slice(0, 10)` idiom used elsewhere in this codebase
 * (useStepData.ts, healthStepProvider.ts's `isoDate`, lib/api/stepRecords.ts),
 * which is UTC-based and can attribute a step record to the wrong calendar
 * day near midnight depending on the device's timezone offset. That existing
 * idiom is left untouched for "today" upserts (out of scope for this
 * feature); everything in this file uses the device's LOCAL calendar day
 * throughout, chosen per the historical-import spec's explicit fallback
 * ("use the device's local timezone") since step data is inherently a
 * local-life-pattern concept (a step taken at 11pm shouldn't count for the
 * wrong day just because UTC differs).
 *
 * Rules:
 *  - `localDateKey` derives a "YYYY-MM-DD" key from a Date's LOCAL
 *    year/month/day fields (never `.toISOString()`, which is UTC).
 *  - Date-range math (`addLocalDays`, `buildInclusiveLocalDateRange`) uses
 *    `Date#setDate`, which JS resolves by local wall-clock rules — this is
 *    DST-safe: "add 1 day" across a spring-forward/fall-back boundary still
 *    lands on the correct next calendar day, because `setDate` adjusts the
 *    underlying instant to preserve the local hour/min/sec, not the elapsed
 *    duration. We only ever read the resulting Date's local Y/M/D back out
 *    via `localDateKey`, so the historical local date for a given day is
 *    never derived from a stored UTC timestamp after the fact (which is the
 *    exact mistake that would let a timezone change shift records into the
 *    wrong day, per the "do not derive historical local dates later using
 *    only UTC timestamps" rule this module is designed around).
 *  - Import date ranges are INCLUSIVE of both `startDate` and `endDate`.
 *  - Today's (possibly incomplete) day IS included in a historical fetch —
 *    the caller (historicalStepImport.ts) is responsible for treating it as
 *    a still-live day if that matters for a given summary metric; this
 *    module only builds the day list.
 *  - Week boundaries reuse the app's EXISTING convention rather than
 *    inventing a device-local one: `supabase/migrations/0001_init.sql`'s
 *    `leaderboard_week_scores` view anchors weeks to UTC Monday via
 *    `date_trunc('week', date::timestamp at time zone 'UTC')`. Reusing that
 *    exact bucketing here (see `utcMondayWeekStart`) keeps a historical
 *    summary's "this week vs last week" comparison consistent with what the
 *    live leaderboard considers "this week", even though individual day
 *    bucketing (above) is local-timezone-based. These are two different
 *    axes — which calendar day a step belongs to (local) vs. which
 *    Monday-anchored bucket a day falls into (UTC) — and are handled
 *    independently on purpose.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" from a Date's LOCAL calendar fields — never UTC. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local midnight for the given Date's calendar day. */
export function startOfLocalDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** A new Date `deltaDays` after `d`, resolved by local wall-clock rules (DST-safe). */
export function addLocalDays(d: Date, deltaDays: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + deltaDays);
  return copy;
}

/** Local-midnight Date instances for every calendar day from `startDate` to `endDate`, inclusive, oldest-first. */
export function buildInclusiveLocalDateRange(startDate: Date, endDate: Date): Date[] {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  const days: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addLocalDays(d, 1)) {
    days.push(d);
  }
  return days;
}

/** startDate/endDate for the last `rangeDays` local calendar days, inclusive of today. */
export function lastNLocalDays(rangeDays: number, now: Date = new Date()): { startDate: Date; endDate: Date } {
  const endDate = startOfLocalDay(now);
  const startDate = addLocalDays(endDate, -(rangeDays - 1));
  return { startDate, endDate };
}

/**
 * The UTC-Monday-anchored week bucket a "YYYY-MM-DD" date key falls into, as
 * a "YYYY-MM-DD" key itself (the Monday of that week) — mirrors
 * `date_trunc('week', date::timestamp at time zone 'UTC')::date` from
 * supabase/migrations/0001_init.sql exactly, so client-side week comparisons
 * agree with the live leaderboard's bucketing.
 */
export function utcMondayWeekStart(dateKey: string): string {
  const [y, m, day] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, day));
  const dow = utc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + offsetToMonday);
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}
