/**
 * Profiles data-access. Profile existence (not an in-memory flag) is now the
 * source of truth for "has this user finished onboarding?" — see app/index.tsx.
 */
import { supabase } from '../supabase';
import type { User } from '../types';

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_color: string;
  daily_goal: number;
  height_cm: number | null;
  stride_length_cm: number | null;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    dailyGoal: row.daily_goal,
    heightCm: row.height_cm ?? undefined,
    strideLengthCm: row.stride_length_cm ?? undefined,
  };
}

/** Returns null if the signed-in user has no profiles row yet (needs onboarding). */
export async function getMyProfile(): Promise<User | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  if (error) throw error;
  return data ? toUser(data as ProfileRow) : null;
}

export async function createMyProfile(displayName: string, heightCm?: number): Promise<User> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: auth.user.id, display_name: displayName, height_cm: heightCm })
    .select()
    .single();
  if (error) throw error;
  return toUser(data as ProfileRow);
}
