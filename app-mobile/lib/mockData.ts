/**
 * Static mock data for the scaffold. No backend yet.
 * Swap with real API/Health data later — shapes follow lib/types.ts.
 */
import type { Challenge, Friend, RivalStatus, StreakDay, User } from './types';

export const currentUser: User = {
  id: 'u_me',
  displayName: 'You',
  avatarColor: '#FF6B4A',
  dailyGoal: 10_000,
  heightCm: 175,
};

export const friends: Friend[] = [
  { id: 'u_me', displayName: 'You', avatarColor: '#FF6B4A', weeklySteps: 58_420, rank: 2, previousRank: 4 },
  { id: 'u_1', displayName: 'Maya R.', avatarColor: '#1FB6A8', weeklySteps: 63_180, rank: 1, previousRank: 1 },
  { id: 'u_2', displayName: 'Dev P.', avatarColor: '#7C6FFF', weeklySteps: 54_900, rank: 3, previousRank: 2 },
  { id: 'u_3', displayName: 'Sam K.', avatarColor: '#FFD23F', weeklySteps: 49_310, rank: 4, previousRank: 3 },
  { id: 'u_4', displayName: 'Ana L.', avatarColor: '#E8543A', weeklySteps: 41_870, rank: 5, previousRank: 5 },
  { id: 'u_5', displayName: 'Theo M.', avatarColor: '#178F84', weeklySteps: 33_540, rank: 6, previousRank: 8 },
];

/** Sorted by rank for direct rendering. */
export const leaderboard: Friend[] = [...friends].sort((a, b) => a.rank - b.rank);

/** Next weekly reset: next Monday 00:00 UTC (global anchor, see PRD §13.4). */
export function nextWeeklyResetMs(now: Date = new Date()): number {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const daysUntilMonday = (8 - day) % 7 || 7;
  const reset = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0),
  );
  return reset.getTime() - now.getTime();
}

export const rival: RivalStatus = {
  name: 'Echo',
  difficultyBand: 'even',
  yourSteps: 8_420,
  rivalSteps: 8_010,
};

export const challenges: Challenge[] = [
  {
    id: 'c_active',
    title: '10k for 3 days',
    subtitle: 'Day 2 of 3 · keep it up',
    variant: 'active',
    progress: 0.66,
    participants: 1,
    startsAt: '2026-01-01',
    visibility: 'public',
  },
  {
    id: 'c_1',
    title: 'Weekend Warrior',
    subtitle: '25k steps Sat–Sun',
    variant: 'joinable',
    progress: 0,
    participants: 14,
    startsAt: '2026-01-01',
    visibility: 'public',
  },
  {
    id: 'c_2',
    title: 'Early Bird',
    subtitle: '2k steps before 9am, 5 days',
    variant: 'joinable',
    progress: 0,
    participants: 8,
    startsAt: '2026-01-01',
    visibility: 'public',
  },
  {
    id: 'c_3',
    title: 'Squad Sprint',
    subtitle: 'Group: 100k combined steps',
    variant: 'joinable',
    progress: 0,
    participants: 23,
    startsAt: '2026-01-01',
    visibility: 'public',
  },
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Last 7 days streak strip; today is the last cell. */
export function buildStreakDays(qualifiedPattern: boolean[] = [true, true, true, false, true, true, true]): StreakDay[] {
  const today = new Date();
  return qualifiedPattern.map((qualified, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (qualifiedPattern.length - 1 - i));
    const isToday = i === qualifiedPattern.length - 1;
    return {
      date: d.toISOString().slice(0, 10),
      label: DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1],
      qualified,
      isToday,
    };
  });
}
