import { supabase } from '../supabase';
import type { Friend } from '../types';

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_color: string;
  normalized_score: number;
  rank: number;
  previous_rank: number | null;
}

/** Wraps the get_leaderboard RPC (current user + accepted friends, current ISO week, ranked). */
export async function getLeaderboard(): Promise<Friend[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase.rpc('get_leaderboard', { p_user_id: auth.user.id });
  if (error) throw error;
  return (data as LeaderboardRow[] | null ?? []).map((row) => ({
    id: row.user_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    weeklySteps: Math.round(row.normalized_score),
    rank: row.rank,
    previousRank: row.previous_rank ?? row.rank,
  }));
}

export async function addFriendByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc('add_friend_by_email', { p_email: email });
  if (error) throw error;
}
