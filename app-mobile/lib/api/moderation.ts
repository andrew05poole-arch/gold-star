/**
 * Report / block data-access (issue #85) — thin wrappers over the RPCs and
 * table in 0029_report_block.sql. Blocking severs friendship/follow both ways
 * server-side and prevents re-contact via DB triggers; these just invoke it.
 */
import { supabase } from '../supabase';

export interface BlockedUser {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
}

/** Blocks a user: severs any friendship/follow both ways and prevents re-contact. */
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_id: userId });
  if (error) throw error;
}

/** Files a report against a user. `reason` defaults server-side to 'other'. */
export async function reportUser(userId: string, reason?: string, context?: string): Promise<void> {
  const { error } = await supabase.rpc('report_user', {
    p_reported_id: userId,
    p_reason: reason ?? 'other',
    p_context: context ?? null,
  });
  if (error) throw error;
}

/** True if the signed-in caller has blocked `userId` (reads their own block row under RLS). */
export async function isUserBlocked(userId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', auth.user.id)
    .eq('blocked_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** The signed-in caller's blocked users, for a manage-blocks list. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('get_my_blocked_users');
  if (error) throw error;
  return ((data as { user_id: string; display_name: string; avatar_color: string; avatar_url: string | null }[] | null) ?? []).map(
    (r) => ({
      id: r.user_id,
      displayName: r.display_name,
      avatarColor: r.avatar_color,
      avatarUrl: r.avatar_url ?? undefined,
    }),
  );
}
