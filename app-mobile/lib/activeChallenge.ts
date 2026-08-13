import type { Challenge } from './types';

export interface PrimaryActiveChallenge {
  primary: Challenge;
  /** How many other currently-active challenges were left out, for a "+N more" hint. */
  extraCount: number;
}

/**
 * Picks the single most relevant currently-active challenge to surface on
 * the Home dashboard's compact summary card, out of the full list returned
 * by getChallenges(). "Active" here means the caller has joined AND today
 * falls inside the challenge's shared window: variant === 'active' &&
 * status === 'active' — the same derived fields getChallenges() already
 * exposes (see lib/api/challenges.ts) and the same filter
 * app/(tabs)/streaks.tsx uses for its own "Active challenge" section, so
 * Home stays consistent with League without re-deriving the window logic.
 *
 * When more than one challenge qualifies, "most relevant" is the one
 * closest to being won — highest progress first, since that's the one most
 * worth a glance from the dashboard. Ties (including every challenge
 * sitting at 0%) fall back to the earliest startsAt, then id, purely to
 * keep the pick stable and deterministic.
 *
 * Returns null when nothing is active, so callers can render nothing (or a
 * minimal "no active challenge" note) without a separate empty-array check.
 */
export function selectPrimaryActiveChallenge(challenges: Challenge[]): PrimaryActiveChallenge | null {
  const active = challenges.filter((c) => c.variant === 'active' && c.status === 'active');
  if (active.length === 0) return null;

  const [primary, ...rest] = [...active].sort((a, b) => {
    if (b.progress !== a.progress) return b.progress - a.progress;
    if (a.startsAt !== b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    return a.id.localeCompare(b.id);
  });

  return { primary, extraCount: rest.length };
}
