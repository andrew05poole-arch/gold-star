import { supabase } from '../supabase';
import type { Challenge } from '../types';

interface ChallengeRow {
  id: string;
  title: string;
  subtitle: string | null;
  goal_value: number;
}

interface ParticipantRow {
  challenge_id: string;
  user_id: string;
  progress: number;
}

export async function getChallenges(): Promise<Challenge[]> {
  const { data: auth } = await supabase.auth.getUser();
  const [{ data: challengeRows, error: cErr }, { data: participantRows, error: pErr }] = await Promise.all([
    supabase.from('challenges').select('id, title, subtitle, goal_value'),
    supabase.from('challenge_participants').select('challenge_id, user_id, progress'),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const byChallenge = new Map<string, ParticipantRow[]>();
  for (const row of (participantRows as ParticipantRow[] | null) ?? []) {
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
