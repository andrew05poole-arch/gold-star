import { supabase } from '../supabase';
import type { StepSource } from '../types';

/** Upserts today's raw step count. The `compute_normalized_steps` and streak triggers (see supabase/migrations) run server-side. */
export async function upsertTodayStepRecord(rawSteps: number, source: StepSource = 'mock'): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('step_records')
    .upsert({ user_id: auth.user.id, date: today, raw_steps: rawSteps, source }, { onConflict: 'user_id,date' });
  if (error) throw error;
}

export interface HistoricalStepRecordInput {
  date: string; // local date key, e.g. "2026-06-25" — see lib/dateRange.ts
  rawSteps: number;
  source: StepSource;
}

export interface UpsertHistoricalResult {
  importedDays: number; // dates that didn't already have a row for this user
  updatedDays: number; // dates that did (a re-import overwrote them)
}

/**
 * Bulk, idempotent upsert for onboarding historical import. Every row is
 * flagged `is_historical_import: true` (migration 0013) so it's excluded
 * from live leaderboard scoring — see that migration's header comment for
 * the full competition-eligibility rationale. Callers (lib/historicalStepImport.ts)
 * must never pass today's date here; today's row belongs to the live
 * sensor write-through path (`upsertTodayStepRecord`) and must stay
 * `is_historical_import: false`.
 */
export async function upsertHistoricalStepRecords(
  records: HistoricalStepRecordInput[],
): Promise<UpsertHistoricalResult> {
  if (records.length === 0) return { importedDays: 0, updatedDays: 0 };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { importedDays: 0, updatedDays: 0 };

  const dates = records.map((r) => r.date);
  const { data: existingRows, error: selectError } = await supabase
    .from('step_records')
    .select('date')
    .eq('user_id', auth.user.id)
    .in('date', dates);
  if (selectError) throw selectError;
  const existingDates = new Set((existingRows ?? []).map((row) => row.date as string));

  const importedAt = new Date().toISOString();
  const payload = records.map((r) => ({
    user_id: auth.user!.id,
    date: r.date,
    raw_steps: r.rawSteps,
    source: r.source,
    is_historical_import: true,
    imported_at: importedAt,
  }));

  const { error } = await supabase.from('step_records').upsert(payload, { onConflict: 'user_id,date' });
  if (error) throw error;

  const importedDays = records.filter((r) => !existingDates.has(r.date)).length;
  return { importedDays, updatedDays: records.length - importedDays };
}

export async function getMyWeeklyNormalizedSteps(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return 0;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const { data, error } = await supabase
    .from('step_records')
    .select('normalized_steps')
    .eq('user_id', auth.user.id)
    .gte('date', weekStart.toISOString().slice(0, 10));
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.normalized_steps), 0);
}
