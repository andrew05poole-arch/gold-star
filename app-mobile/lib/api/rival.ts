import { supabase } from '../supabase';
import type { RivalStatus } from '../types';

type DifficultyBand = RivalStatus['difficultyBand'];

/** Approximates PRD §13.3's "smooth hourly schedule" with a linear elapsed-day fraction. */
function dayElapsedFraction(): number {
  const now = new Date();
  const minutesElapsed = now.getHours() * 60 + now.getMinutes();
  return Math.min(1, Math.max(0.05, minutesElapsed / (24 * 60)));
}

export async function getRivalStatus(todayNormalizedSteps: number): Promise<RivalStatus> {
  const { data: auth } = await supabase.auth.getUser();
  const fallback: RivalStatus = { name: 'Echo', difficultyBand: 'even', yourSteps: todayNormalizedSteps, rivalSteps: 0 };
  if (!auth.user) return fallback;

  const [{ data: profileRow }, { data: target, error }] = await Promise.all([
    supabase.from('rival_profiles').select('name, difficulty_band').eq('user_id', auth.user.id).maybeSingle(),
    supabase.rpc('get_rival_target', { p_user_id: auth.user.id }),
  ]);
  if (error) throw error;

  return {
    name: profileRow?.name ?? 'Echo',
    difficultyBand: (profileRow?.difficulty_band as RivalStatus['difficultyBand']) ?? 'even',
    yourSteps: todayNormalizedSteps,
    rivalSteps: Math.round((target ?? 6000) * dayElapsedFraction()),
  };
}

/**
 * Updates the difficulty band on the signed-in user's `rival_profiles` row
 * (created automatically at onboarding — see 0003_rival_profile_onboarding.sql).
 */
export async function updateDifficultyBand(band: DifficultyBand): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('rival_profiles')
    .update({ difficulty_band: band })
    .eq('user_id', auth.user.id);
  if (error) throw error;
}
