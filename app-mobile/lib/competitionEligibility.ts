/**
 * Documents (does not itself enforce) the competition-eligibility rule for
 * historical-imported step data.
 *
 * THE AUTHORITATIVE ENFORCEMENT IS SERVER-SIDE: `supabase/migrations/
 * 0013_historical_step_import.sql` excludes every `step_records` row with
 * `is_historical_import = true` directly in the `leaderboard_week_scores`
 * view definition — the one and only place `get_leaderboard` reads scores
 * from. That's what actually protects live standings; it cannot be
 * bypassed by a client forgetting to filter, because the filter lives in
 * the view every read goes through, not in application code.
 *
 * This function exists only so a future client-side UI that wants to
 * *explain* eligibility (e.g. "3 of these imported days will count toward
 * your league once verified live") has one named, tested place to ask,
 * instead of reimplementing the rule ad hoc and risking drift from the real
 * SQL-side rule. Never use this function's result to withhold a write or a
 * reward — per the feature's own requirement, UI-side filtering alone is
 * insufficient.
 *
 * Deliberately simpler than a generic
 * `{ localDate, accountCreatedAt, competitionJoinedAt, competitionStartAt }`
 * signature: this schema has no separate "league join" or "competition
 * start" timestamp to weigh against a record's date — the friends
 * leaderboard has no join event beyond account creation, and challenges are
 * already structurally immune (each participant's progress window is
 * `[joined_at, joined_at + duration_days - 1]`, which only extends forward
 * from the moment they joined, so a historical date — always in the past
 * relative to joining — can never fall inside it; see
 * supabase/migrations/0002_challenge_progress.sql). Inventing those extra
 * parameters here would model timestamps this app doesn't actually track.
 * If a real "league season" or "competition" concept is added later, extend
 * this signature then, against that real schema.
 */
export interface CompetitionEligibilityParams {
  isHistoricalImport: boolean;
}

export function isStepRecordCompetitionEligible(params: CompetitionEligibilityParams): boolean {
  return !params.isHistoricalImport;
}
