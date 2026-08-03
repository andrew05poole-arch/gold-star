import { supabase } from '../supabase';
import type {
  Challenge,
  ChallengeDetail,
  ChallengeGoalType,
  ChallengeInvite,
  ChallengeMember,
  ChallengeStatus,
  ChallengeVisibility,
} from '../types';

interface ChallengeRow {
  id: string;
  title: string;
  subtitle: string | null;
  goal_value: number;
  starts_at: string;
  visibility: ChallengeVisibility;
}

interface ChallengeDetailRow {
  id: string;
  title: string;
  subtitle: string | null;
  goal_type: ChallengeGoalType;
  goal_value: number;
  duration_days: number;
  created_by: string | null;
  starts_at: string;
  created_at: string;
  visibility: ChallengeVisibility;
}

// Full row shape of challenge_participant_status (0005_challenge_completion.sql)
// — getChallenges() below only selects a subset of these columns; the detail
// screen needs the rest (joined_at/window_end) to show each member's window.
interface FullParticipantStatusRow {
  challenge_id: string;
  user_id: string;
  progress: number;
  joined_at: string;
  window_start: string;
  window_end: string;
  status: ChallengeStatus;
}

interface ProfileNameRow {
  id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
}

interface ParticipantRow {
  challenge_id: string;
  user_id: string;
  progress: number;
}

// Mirrors public.challenge_participant_status (0005_challenge_completion.sql),
// which derives `status` from the participant's own window vs. today rather
// than a value stored on challenge_participants, so it can never go stale.
interface ParticipantStatusRow extends ParticipantRow {
  status: ChallengeStatus;
}

export async function getChallenges(): Promise<Challenge[]> {
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: challengeRows, error: cErr }, { data: participantRows, error: pErr }, { data: placementRows, error: plErr }] =
    await Promise.all([
      supabase.from('challenges').select('id, title, subtitle, goal_value, starts_at, visibility'),
      supabase.from('challenge_participant_status').select('challenge_id, user_id, progress, status'),
      auth.user
        ? supabase.from('challenge_placements').select('challenge_id, placement, medal').eq('user_id', auth.user.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;
  if (plErr) throw plErr;

  const byChallenge = new Map<string, ParticipantStatusRow[]>();
  for (const row of (participantRows as ParticipantStatusRow[] | null) ?? []) {
    const list = byChallenge.get(row.challenge_id) ?? [];
    list.push(row);
    byChallenge.set(row.challenge_id, list);
  }

  const myPlacementByChallenge = new Map(
    ((placementRows as { challenge_id: string; placement: number; medal: boolean }[] | null) ?? []).map((r) => [
      r.challenge_id,
      r,
    ]),
  );

  return ((challengeRows as ChallengeRow[] | null) ?? []).map((row) => {
    const participants = byChallenge.get(row.id) ?? [];
    const mine = auth.user ? participants.find((p) => p.user_id === auth.user!.id) : undefined;
    const myPlacement = myPlacementByChallenge.get(row.id);
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle ?? '',
      variant: mine ? 'active' : 'joinable',
      status: mine?.status,
      progress: mine ? Math.min(1, mine.progress / row.goal_value) : 0,
      participants: participants.length,
      startsAt: row.starts_at,
      visibility: row.visibility,
      placement: myPlacement?.placement,
      medal: myPlacement?.medal,
    };
  });
}

export async function joinChallenge(challengeId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('challenge_participants')
    .upsert({ challenge_id: challengeId, user_id: auth.user.id, progress: 0 }, { onConflict: 'challenge_id,user_id' });
  if (error) throw error;
}

// Creates a new challenge and joins the caller as its first participant, in
// a single atomic call. See supabase/migrations/0007_create_challenge.sql —
// `challenges` has no client insert policy, so this is done via a
// `security definer` RPC rather than a two-step client insert.
//
// `startsAt` (local date key, e.g. "2026-08-01") schedules the challenge's
// shared window start — see 0015_scheduled_challenges.sql. Omitted entirely
// (not even sent as null) when not provided, so the SQL-side
// `default current_date` applies rather than computing "today" in JS and
// risking a client/server clock mismatch. `visibility` (0020_challenge_
// visibility_invites.sql) defaults server-side to 'public' the same way.
export async function createChallenge(
  title: string,
  goalType: ChallengeGoalType,
  goalValue: number,
  durationDays: number,
  startsAt?: string,
  visibility?: ChallengeVisibility,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_title: title,
    p_goal_type: goalType,
    p_goal_value: goalValue,
    p_duration_days: durationDays,
    ...(startsAt ? { p_starts_at: startsAt } : {}),
    ...(visibility ? { p_visibility: visibility } : {}),
  });
  if (error) throw error;
  return data as string;
}

/**
 * Full detail for one challenge: the challenge row plus every participant's
 * own progress/status/window, ranked by progress. `challenges` and
 * `challenge_participant_status` are both readable by any authenticated
 * user (0001_init.sql / 0005_challenge_completion.sql), so this is a plain
 * client-side join across three queries — same pattern as getChallenges().
 */
export async function getChallengeDetail(challengeId: string): Promise<ChallengeDetail> {
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: challengeRow, error: cErr }, { data: statusRows, error: sErr }, { data: placementRows, error: plErr }] =
    await Promise.all([
      supabase.from('challenges').select('*').eq('id', challengeId).single(),
      supabase.from('challenge_participant_status').select('*').eq('challenge_id', challengeId),
      supabase.from('challenge_placements').select('user_id, placement, medal').eq('challenge_id', challengeId),
    ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if (plErr) throw plErr;

  const placementByUser = new Map(
    ((placementRows as { user_id: string; placement: number; medal: boolean }[] | null) ?? []).map((r) => [r.user_id, r]),
  );

  const rows = (statusRows as FullParticipantStatusRow[] | null) ?? [];
  const memberIds = rows.map((r) => r.user_id);

  let profilesById = new Map<string, ProfileNameRow>();
  if (memberIds.length > 0) {
    const { data: profileRows, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_color, avatar_url')
      .in('id', memberIds);
    if (pErr) throw pErr;
    profilesById = new Map(((profileRows as ProfileNameRow[] | null) ?? []).map((p) => [p.id, p]));
  }

  const members: ChallengeMember[] = rows
    .map((r) => {
      const profile = profilesById.get(r.user_id);
      const placement = placementByUser.get(r.user_id);
      return {
        userId: r.user_id,
        displayName: profile?.display_name ?? 'StepLeague user',
        avatarColor: profile?.avatar_color ?? '#766F6A', // fallback for an orphaned participant row with no matching profile
        avatarUrl: profile?.avatar_url ?? undefined,
        progress: r.progress,
        status: r.status,
        joinedAt: r.joined_at,
        windowStart: r.window_start,
        windowEnd: r.window_end,
        isMe: auth.user?.id === r.user_id,
        placement: placement?.placement,
        medal: placement?.medal,
      };
    })
    // Finalized challenges (0026_challenge_placements_and_points.sql) sort by
    // the permanent placement; unfinalized ones fall back to live progress.
    .sort((a, b) => {
      if (a.placement != null && b.placement != null) return a.placement - b.placement;
      if (a.placement != null) return -1;
      if (b.placement != null) return 1;
      return b.progress - a.progress;
    });

  const row = challengeRow as ChallengeDetailRow;
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? '',
    goalType: row.goal_type,
    goalValue: row.goal_value,
    durationDays: row.duration_days,
    startsAt: row.starts_at,
    createdAt: row.created_at,
    isOwner: !!auth.user && auth.user.id === row.created_by,
    visibility: row.visibility,
    members,
  };
}

/** Title/subtitle only — see 0014_challenge_detail.sql for why goal/duration aren't editable after creation. */
export async function updateChallenge(challengeId: string, title: string, subtitle: string): Promise<void> {
  const { error } = await supabase.rpc('update_challenge', {
    p_challenge_id: challengeId,
    p_title: title,
    p_subtitle: subtitle,
  });
  if (error) throw error;
}

export async function deleteChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_challenge', { p_challenge_id: challengeId });
  if (error) throw error;
}

interface ChallengeInviteRow {
  challenge_id: string;
  invited_by: string;
  created_at: string;
}

/** Pending invites for the signed-in user — see 0020_challenge_visibility_invites.sql. Plain client-side join, same pattern as getChallengeDetail(). */
export async function getChallengeInvites(): Promise<ChallengeInvite[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data: inviteRows, error: iErr } = await supabase
    .from('challenge_invites')
    .select('challenge_id, invited_by, created_at')
    .eq('invited_user_id', auth.user.id);
  if (iErr) throw iErr;

  const rows = (inviteRows as ChallengeInviteRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const challengeIds = [...new Set(rows.map((r) => r.challenge_id))];
  const inviterIds = [...new Set(rows.map((r) => r.invited_by))];

  const [{ data: challengeRows, error: cErr }, { data: profileRows, error: pErr }] = await Promise.all([
    supabase.from('challenges').select('id, title').in('id', challengeIds),
    supabase.from('profiles').select('id, display_name').in('id', inviterIds),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const titleById = new Map(
    ((challengeRows as { id: string; title: string }[] | null) ?? []).map((c) => [c.id, c.title]),
  );
  const nameById = new Map(
    ((profileRows as { id: string; display_name: string }[] | null) ?? []).map((p) => [p.id, p.display_name]),
  );

  return rows.map((r) => ({
    challengeId: r.challenge_id,
    challengeTitle: titleById.get(r.challenge_id) ?? 'A challenge',
    invitedBy: r.invited_by,
    invitedByName: nameById.get(r.invited_by) ?? 'Someone',
    createdAt: r.created_at,
  }));
}

/** Creator-only — see 0020_challenge_visibility_invites.sql for the accepted-friends-only restriction. */
export async function inviteToChallenge(challengeId: string, friendId: string): Promise<void> {
  const { error } = await supabase.rpc('invite_to_challenge', { p_challenge_id: challengeId, p_friend_id: friendId });
  if (error) throw error;
}

export async function respondToChallengeInvite(challengeId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_challenge_invite', {
    p_challenge_id: challengeId,
    p_accept: accept,
  });
  if (error) throw error;
}
