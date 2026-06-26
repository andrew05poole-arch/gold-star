import { supabase } from '../supabase';
import type { StreakDay } from '../types';

export interface StreakInfo {
  currentLength: number;
  longestLength: number;
  freezesRemaining: number;
}

export async function getMyStreak(): Promise<StreakInfo> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { currentLength: 0, longestLength: 0, freezesRemaining: 2 };
  const { data, error } = await supabase
    .from('streaks')
    .select('current_length, longest_length, freezes_remaining')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { currentLength: 0, longestLength: 0, freezesRemaining: 2 };
  return {
    currentLength: data.current_length,
    longestLength: data.longest_length,
    freezesRemaining: data.freezes_remaining,
  };
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Last `days` of step_records mapped to the streak-calendar strip shape (qualifies at 60% of daily goal, PRD §13.5). */
export async function getMyStreakDays(dailyGoal: number, days = 7): Promise<StreakDay[]> {
  const { data: auth } = await supabase.auth.getUser();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  let byDate = new Map<string, number>();
  if (auth.user) {
    const { data, error } = await supabase
      .from('step_records')
      .select('date, raw_steps')
      .eq('user_id', auth.user.id)
      .gte('date', start.toISOString().slice(0, 10));
    if (error) throw error;
    byDate = new Map((data ?? []).map((row) => [row.date as string, row.raw_steps as number]));
  }

  const floor = dailyGoal * 0.6;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return {
      date: iso,
      label: DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1],
      qualified: (byDate.get(iso) ?? 0) >= floor,
      isToday: iso === todayIso,
    };
  });
}
