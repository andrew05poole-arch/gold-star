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
