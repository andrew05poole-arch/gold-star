import { supabase } from '../supabase';
import type { Friend, PendingFriendRequest } from '../types';

interface LeaderboardRow {
  user_id: string;
  display_name: string;
  avatar_color: string;
  normalized_score: number;
  rank: number;
  previous_rank: number | null;
}

interface PendingFriendRequestRow {
  requester_id: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
}

function mapLeaderboardRows(data: LeaderboardRow[] | null): Friend[] {
  return (data ?? []).map((row) => ({
    id: row.user_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    weeklySteps: Math.round(row.normalized_score),
    rank: row.rank,
    previousRank: row.previous_rank ?? row.rank,
  }));
}

/** Wraps the get_leaderboard RPC (current user + accepted friends, current ISO week, ranked). */
export async function getLeaderboard(): Promise<Friend[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase.rpc('get_leaderboard', { p_user_id: auth.user.id });
  if (error) throw error;
  return mapLeaderboardRows(data as LeaderboardRow[] | null);
}

/** Wraps get_city_leaderboard: public ranking of every profile sharing `city` (case-insensitive). */
export async function getCityLeaderboard(city: string): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('get_city_leaderboard', { p_city: city });
  if (error) throw error;
  return mapLeaderboardRows(data as LeaderboardRow[] | null);
}

/** Wraps get_country_leaderboard: public ranking of every profile sharing `country` (case-insensitive). */
export async function getCountryLeaderboard(country: string): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('get_country_leaderboard', { p_country: country });
  if (error) throw error;
  return mapLeaderboardRows(data as LeaderboardRow[] | null);
}

/** Wraps get_global_leaderboard: public ranking across every profile. */
export async function getGlobalLeaderboard(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('get_global_leaderboard');
  if (error) throw error;
  return mapLeaderboardRows(data as LeaderboardRow[] | null);
}

/** Sends a pending friend request by email (requires the recipient to accept). */
export async function addFriendByEmail(email: string): Promise<void> {
  const { error } = await supabase.rpc('add_friend_by_email', { p_email: email });
  if (error) throw error;
}

/** Sends a friend request to the owner of a referral code (see onboarding invite-code field). */
export async function addFriendByReferralCode(code: string): Promise<void> {
  const { error } = await supabase.rpc('add_friend_by_referral_code', { p_code: code });
  if (error) throw error;
}

/** Incoming pending friend requests awaiting the current user's response. */
export async function getPendingFriendRequests(): Promise<PendingFriendRequest[]> {
  const { data, error } = await supabase.rpc('get_pending_friend_requests');
  if (error) throw error;
  return (data as PendingFriendRequestRow[] | null ?? []).map((row) => ({
    requesterId: row.requester_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
  }));
}

/** Accepts an incoming friend request from `requesterId`. */
export async function acceptFriendRequest(requesterId: string): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_requester_id: requesterId,
    p_accept: true,
  });
  if (error) throw error;
}

/** Declines an incoming friend request from `requesterId`. */
export async function declineFriendRequest(requesterId: string): Promise<void> {
  const { error } = await supabase.rpc('respond_to_friend_request', {
    p_requester_id: requesterId,
    p_accept: false,
  });
  if (error) throw error;
}

/** Removes an existing (accepted) friendship in both directions. */
export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  if (error) throw error;
}
