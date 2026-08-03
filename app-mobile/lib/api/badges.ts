import { supabase } from '../supabase';
import type { ChallengeBadgeSummary } from '../types';

interface PlacementRow {
  placement: number;
  medal: boolean;
}

/**
 * Badge/points summary for a user: medal counts and "competed in" from
 * challenge_placements (only present once a challenge finalizes — see
 * 0026_challenge_placements_and_points.sql — so this counts finalized
 * challenges, not ones still in progress), plus lifetime points and World
 * Rank from the two read RPCs. `challenge_placements`' own RLS naturally
 * scopes a stranger's rows to challenges the caller can also see (public,
 * or shared invite-only membership) — own-profile calls always see every
 * row via that policy's `user_id = auth.uid()` clause regardless.
 */
export async function getBadgeSummary(userId: string): Promise<ChallengeBadgeSummary> {
  const [
    { data: placementRows, error: pErr },
    { data: totalPoints, error: tErr },
    { data: worldRank, error: wErr },
  ] = await Promise.all([
    supabase.from('challenge_placements').select('placement, medal').eq('user_id', userId),
    supabase.rpc('get_total_points', { p_user_id: userId }),
    supabase.rpc('get_world_rank', { p_user_id: userId }),
  ]);
  if (pErr) throw pErr;
  if (tErr) throw tErr;
  if (wErr) throw wErr;

  const rows = (placementRows as PlacementRow[] | null) ?? [];
  return {
    competed: rows.length,
    gold: rows.filter((r) => r.medal && r.placement === 1).length,
    silver: rows.filter((r) => r.medal && r.placement === 2).length,
    bronze: rows.filter((r) => r.medal && r.placement === 3).length,
    totalPoints: (totalPoints as number | null) ?? 0,
    worldRank: (worldRank as number | null) ?? null,
  };
}

export async function getMyBadgeSummary(): Promise<ChallengeBadgeSummary> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { competed: 0, gold: 0, silver: 0, bronze: 0, totalPoints: 0, worldRank: null };
  }
  return getBadgeSummary(auth.user.id);
}
