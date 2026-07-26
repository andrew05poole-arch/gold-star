/**
 * Shared domain types for the DailyStep MVP.
 * Mirrors the data model sketch in docs/PRD.md §13.1.
 */

export type StepSource = 'healthkit' | 'googlefit' | 'mock';

export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

export interface User {
  id: string;
  displayName: string;
  avatarColor: string;
  dailyGoal: number;
  heightCm?: number;
  strideLengthCm?: number;
  referralCode?: string;
}

/** A single day's step data (raw + normalized). */
export interface StepDay {
  date: string; // ISO local day, e.g. "2026-06-25"
  rawSteps: number;
  normalizedSteps: number;
}

export interface StepSnapshot {
  todaySteps: number;
  dailyGoal: number;
  streakDays: number;
  source: StepSource;
  weeklyHistory: StepDay[]; // most-recent-last
}

export interface Friend {
  id: string;
  displayName: string;
  avatarColor: string;
  weeklySteps: number;
  rank: number;
  previousRank: number;
}

/** An incoming, not-yet-accepted friend request. */
export interface PendingFriendRequest {
  requesterId: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

export interface RivalStatus {
  name: string;
  difficultyBand: 'chill' | 'even' | 'pushy';
  yourSteps: number; // today, normalized
  rivalSteps: number; // today, projected pace
}

export type ChallengeVariant = 'active' | 'joinable';

/**
 * Lifecycle state of a joined challenge, derived from the participant's own
 * [joined_at, joined_at + duration_days - 1] window vs. today, and whether
 * their progress met the goal once that window closed. Undefined when the
 * challenge hasn't been joined (variant === 'joinable').
 */
export type ChallengeStatus = 'active' | 'completed' | 'expired';

export interface Challenge {
  id: string;
  title: string;
  subtitle: string;
  variant: ChallengeVariant;
  status?: ChallengeStatus; // set when variant === 'active'
  progress: number; // 0..1, used when variant === 'active'
  participants: number;
}

/** One cell in the streak calendar strip. */
export interface StreakDay {
  date: string;
  label: string; // e.g. "M", "T"
  qualified: boolean;
  isToday: boolean;
}
