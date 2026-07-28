import { supabase } from '../supabase';
import type { Challenge, ChallengeDetail, ChallengeGoalType, ChallengeMember, ChallengeStatus } from '../types';

interface ChallengeRow {
  id: string;
  title: string;
  subtitle: string | null;
  goal_value: number;
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
}

// Full row shape of challenge_participant_status (0005_challenge_completion.sql)
// — getChallenges() below only selects a subset of these columns; the detail
// screen needs the rest (joined_at/window_end) to show each member's window.
interface FullParticipantStatusRow {
  challenge_id: string;
  user_id: string;
  progress: number;
  joined_at: string;
  window_end: string;
  status: ChallengeStatus;
}

interface ProfileNameRow {
  id: string;
  display_name: string;
  avatar_color: string;
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
  const [{ data: challengeRows, error: cErr }, { data: participantRows, error: pErr }] = await Promise.all([
    supabase.from('challenges').select('id, title, subtitle, goal_value'),
    supabase.from('challenge_participant_status').select('challenge_id, user_id, progress, status'),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const byChallenge = new Map<string, ParticipantStatusRow[]>();
  for (const row of (participantRows as ParticipantStatusRow[] | null) ?? []) {
    const list = byChallenge.get(row.challenge_id) ?? [];
    list.push(row);
    byChallenge.set(row.challenge_id, list);
  }

  return ((challengeRows as ChallengeRow[] | null) ?? []).map((row) => {
    const participants = byChallenge.get(row.id) ?? [];
    const mine = auth.user ? participants.find((p) => p.user_id === auth.user!.id) : undefined;
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle ?? '',
      variant: mine ? 'active' : 'joinable',
      status: mine?.status,
      progress: mine ? Math.min(1, mine.progress / row.goal_value) : 0,
      participants: participants.length,
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
export async function createChallenge(
  title: string,
  goalType: ChallengeGoalType,
  goalValue: number,
  durationDays: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_title: title,
    p_goal_type: goalType,
    p_goal_value: goalValue,
    p_duration_days: durationDays,
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
  const [{ data: challengeRow, error: cErr }, { data: statusRows, error: sErr }] = await Promise.all([
    supabase.from('challenges').select('*').eq('id', challengeId).single(),
    supabase.from('challenge_participant_status').select('*').eq('challenge_id', challengeId),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;

  const rows = (statusRows as FullParticipantStatusRow[] | null) ?? [];
  const memberIds = rows.map((r) => r.user_id);

  let profilesById = new Map<string, ProfileNameRow>();
  if (memberIds.length > 0) {
    const { data: profileRows, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_color')
      .in('id', memberIds);
    if (pErr) throw pErr;
    profilesById = new Map(((profileRows as ProfileNameRow[] | null) ?? []).map((p) => [p.id, p]));
  }

  const members: ChallengeMember[] = rows
    .map((r) => {
      const profile = profilesById.get(r.user_id);
      return {
        userId: r.user_id,
        displayName: profile?.display_name ?? 'StepLeague user',
        avatarColor: profile?.avatar_color ?? '#766F6A', // fallback for an orphaned participant row with no matching profile
        progress: r.progress,
        status: r.status,
        joinedAt: r.joined_at,
        windowEnd: r.window_end,
        isMe: auth.user?.id === r.user_id,
      };
    })
    .sort((a, b) => b.progress - a.progress);

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
