/**
 * Profiles data-access. Profile existence (not an in-memory flag) is now the
 * source of truth for "has this user finished onboarding?" — see app/index.tsx.
 */
import { supabase } from '../supabase';
import { getBadgeSummary } from './badges';
import type { ChallengeGoalType, ChallengeStatus, FriendshipStatus, PublicChallengeHistoryItem, PublicProfile, SocialCounts, User } from '../types';

interface ProfileRow {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  bio: string | null;
  daily_goal: number;
  height_cm: number | null;
  stride_length_cm: number | null;
  referral_code: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url ?? undefined,
    bio: row.bio ?? undefined,
    dailyGoal: row.daily_goal,
    heightCm: row.height_cm ?? undefined,
    strideLengthCm: row.stride_length_cm ?? undefined,
    referralCode: row.referral_code,
    city: row.city ?? undefined,
    region: row.region ?? undefined,
    country: row.country ?? undefined,
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

/** Updates the signed-in user's self-reported location. Blank fields are stored as null. */
export async function updateLocation(city?: string, region?: string, country?: string): Promise<User> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .update({
      city: city?.trim() || null,
      region: region?.trim() || null,
      country: country?.trim() || null,
    })
    .eq('id', auth.user.id)
    .select()
    .single();
  if (error) throw error;
  return toUser(data as ProfileRow);
}

/**
 * Sets the user's starter daily goal, e.g. from the onboarding historical-import
 * summary's suggested goal (see lib/stepHistorySummary.ts). `daily_goal`
 * otherwise only ever gets Postgres's schema default (10000) — there is no
 * other write path to it today.
 */
export async function updateDailyGoal(dailyGoal: number): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update({ daily_goal: dailyGoal }).eq('id', auth.user.id);
  if (error) throw error;
}

/** Sets (or clears, with an empty string) the signed-in user's About Me. Server-side capped at 160 chars (0016_profile_bio_and_photo.sql). */
export async function updateBio(bio: string): Promise<User> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const trimmed = bio.trim();
  const { data, error } = await supabase
    .from('profiles')
    .update({ bio: trimmed.length > 0 ? trimmed : null })
    .eq('id', auth.user.id)
    .select()
    .single();
  if (error) throw error;
  return toUser(data as ProfileRow);
}

/**
 * Uploads a locally-picked image (see expo-image-picker in app/(tabs)/profile.tsx)
 * to the "avatars" storage bucket at `{userId}/avatar.<ext>` (upsert: true, so
 * re-uploading replaces the same file) and points `profiles.avatar_url` at its
 * public URL. Returns the new URL with a cache-busting query param — the path
 * is stable across re-uploads, so without one a CDN/browser could keep
 * serving the old cached image at the same URL.
 */
export async function uploadAvatar(localUri: string, contentType: string): Promise<string> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');

  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const extension = contentType.split('/')[1] ?? 'jpg';
  const path = `${auth.user.id}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = `${publicUrlData.publicUrl}?updated=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', auth.user.id);
  if (updateError) throw updateError;

  return avatarUrl;
}

interface PublicProfileRow {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

interface PublicStreakRow {
  current_length: number;
  longest_length: number;
}

interface PublicChallengeStatusRow {
  challenge_id: string;
  joined_at: string;
  progress: number;
  status: ChallengeStatus;
}

interface ChallengeTitleRow {
  id: string;
  title: string;
  goal_type: ChallengeGoalType;
  goal_value: number;
}

interface FriendshipRow {
  user_id: string;
  friend_id: string;
  status: string;
}

/**
 * Derives the caller's relationship to `targetId` from the raw friendship
 * row(s) between them. `friendships`' SELECT policy (0001_init.sql) only
 * ever returns rows the caller is part of, so an accepted friendship always
 * comes back as (at least) one row here — no separate "am I friends with
 * them" query needed.
 */
function deriveFriendshipStatus(selfId: string | undefined, targetId: string, rows: FriendshipRow[]): FriendshipStatus {
  if (!selfId) return 'none';
  if (rows.some((r) => r.status === 'accepted')) return 'accepted';
  if (rows.some((r) => r.status === 'pending' && r.user_id === selfId && r.friend_id === targetId)) return 'pending_sent';
  if (rows.some((r) => r.status === 'pending' && r.user_id === targetId && r.friend_id === selfId)) return 'pending_received';
  return 'none';
}

/**
 * Another user's public profile: name/avatar/bio, streak, and challenge
 * history — everything already readable by any authenticated user
 * (`profiles`, `challenge_participant_status`) plus `streaks`, opened up in
 * 0018_public_profile_streaks.sql. No RPC needed since none of this
 * requires a security-definer computation, just plain reads under RLS —
 * same reasoning `getChallenges`/`getChallengeDetail` already use.
 */
export async function getPublicProfile(userId: string): Promise<PublicProfile> {
  const { data: auth } = await supabase.auth.getUser();

  const [
    { data: profileRow, error: pErr },
    { data: streakRow, error: sErr },
    { data: statusRows, error: cErr },
    { count: followerCount, error: fErr },
    { data: myFollowRow, error: ifErr },
    { data: friendCountData, error: fcErr },
    { data: friendshipRows, error: fsErr },
    { data: placementRows, error: plErr },
    badges,
  ] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_color, avatar_url, bio, created_at').eq('id', userId).single(),
    supabase.from('streaks').select('current_length, longest_length').eq('user_id', userId).maybeSingle(),
    supabase
      .from('challenge_participant_status')
      .select('challenge_id, joined_at, progress, status')
      .eq('user_id', userId),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
    auth.user
      ? supabase.from('follows').select('follower_id').eq('follower_id', auth.user.id).eq('followee_id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc('get_friend_count', { p_user_id: userId }),
    auth.user
      ? supabase
          .from('friendships')
          .select('user_id, friend_id, status')
          .or(`and(user_id.eq.${auth.user.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${auth.user.id})`)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('challenge_placements').select('challenge_id, placement, medal').eq('user_id', userId),
    getBadgeSummary(userId),
  ]);
  if (pErr) throw pErr;
  if (sErr) throw sErr;
  if (cErr) throw cErr;
  if (fErr) throw fErr;
  if (ifErr) throw ifErr;
  if (fcErr) throw fcErr;
  if (fsErr) throw fsErr;
  if (plErr) throw plErr;

  const placementByChallenge = new Map(
    ((placementRows as { challenge_id: string; placement: number; medal: boolean }[] | null) ?? []).map((r) => [
      r.challenge_id,
      r,
    ]),
  );

  const statusRowsTyped = (statusRows as PublicChallengeStatusRow[] | null) ?? [];
  const challengeIds = statusRowsTyped.map((r) => r.challenge_id);

  let challengesById = new Map<string, ChallengeTitleRow>();
  if (challengeIds.length > 0) {
    const { data: challengeRows, error: chErr } = await supabase
      .from('challenges')
      .select('id, title, goal_type, goal_value')
      .in('id', challengeIds);
    if (chErr) throw chErr;
    challengesById = new Map(((challengeRows as ChallengeTitleRow[] | null) ?? []).map((c) => [c.id, c]));
  }

  const challengeHistory: PublicChallengeHistoryItem[] = statusRowsTyped
    .slice()
    .sort((a, b) => (a.joined_at < b.joined_at ? 1 : a.joined_at > b.joined_at ? -1 : 0))
    .map((r) => {
      const c = challengesById.get(r.challenge_id);
      if (!c) return null;
      const placement = placementByChallenge.get(r.challenge_id);
      const item: PublicChallengeHistoryItem = {
        title: c.title,
        goalType: c.goal_type,
        goalValue: c.goal_value,
        progress: r.progress,
        status: r.status,
        placement: placement?.placement,
        medal: placement?.medal,
      };
      return item;
    })
    .filter((item): item is PublicChallengeHistoryItem => item !== null);

  const profile = profileRow as PublicProfileRow;
  const streak = streakRow as PublicStreakRow | null;

  return {
    id: profile.id,
    displayName: profile.display_name,
    avatarColor: profile.avatar_color,
    avatarUrl: profile.avatar_url ?? undefined,
    bio: profile.bio ?? undefined,
    memberSince: profile.created_at,
    currentStreak: streak?.current_length ?? 0,
    longestStreak: streak?.longest_length ?? 0,
    challengeHistory,
    followerCount: followerCount ?? 0,
    isFollowing: !!myFollowRow,
    friendCount: (friendCountData as number | null) ?? 0,
    friendshipStatus: deriveFriendshipStatus(auth.user?.id, userId, (friendshipRows as FriendshipRow[] | null) ?? []),
    badges,
  };
}

/** Friends/followers/following counts for the signed-in user's own profile tab (app/(tabs)/profile.tsx). */
export async function getMySocialCounts(): Promise<SocialCounts> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { friends: 0, followers: 0, following: 0 };

  const [
    { data: friendCountData, error: fcErr },
    { count: followerCount, error: flErr },
    { count: followingCount, error: fgErr },
  ] = await Promise.all([
    supabase.rpc('get_friend_count', { p_user_id: auth.user.id }),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', auth.user.id),
    supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', auth.user.id),
  ]);
  if (fcErr) throw fcErr;
  if (flErr) throw flErr;
  if (fgErr) throw fgErr;

  return {
    friends: (friendCountData as number | null) ?? 0,
    followers: followerCount ?? 0,
    following: followingCount ?? 0,
  };
}

/** Sends a friend request directly to a user id — see 0022_friend_request_from_profile.sql. */
export async function sendFriendRequest(userId: string): Promise<void> {
  const { error } = await supabase.rpc('send_friend_request', { p_friend_id: userId });
  if (error) throw error;
}

export async function followUser(userId: string): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const { error } = await supabase.from('follows').insert({ follower_id: auth.user.id, followee_id: userId });
  if (error) throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', auth.user.id)
    .eq('followee_id', userId);
  if (error) throw error;
}

/**
 * Permanently deletes the signed-in user's account and all their data
 * (Apple App Store Guideline 5.1.1(v)). Order matters:
 *   1. Remove avatar file(s) via the storage API under the user's own RLS
 *      (0016) — the `delete_account` RPC deliberately can't (storage.objects
 *      is owned by supabase_storage_admin, and a raw row delete would leak the
 *      blob). Best-effort: a storage hiccup must never block the deletion.
 *   2. `delete_account` RPC (0027) purges all app data + best-effort auth row.
 *   3. Clear the local session. The auth row may already be gone, so signOut
 *      can error server-side — ignore it; the local clear is what matters.
 * After this resolves, the caller navigates to '/', and app/index.tsx routes
 * the now-session-less app to /login.
 */
export async function deleteAccount(): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;

  if (userId) {
    try {
      const { data: files } = await supabase.storage.from('avatars').list(userId);
      if (files && files.length > 0) {
        await supabase.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      // Avatar cleanup is best-effort — never block account deletion on it.
    }
  }

  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;

  try {
    await supabase.auth.signOut();
  } catch {
    // The auth row may already be deleted; the local session clear is best-effort.
  }
}
