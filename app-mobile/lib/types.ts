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
  city?: string;
  region?: string;
  country?: string;
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

/** Mirrors `challenges.goal_type` in supabase/migrations/0001_init.sql. */
export type ChallengeGoalType = 'stepsPerDay' | 'totalSteps' | 'daysStreak';

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

/** Mirrors the `event_type` check constraint on `activity_events` (0008_activity_events.sql). */
export type ActivityEventType = 'streak_milestone' | 'challenge_completed' | 'challenge_joined' | 'friend_added';

/** A row from `get_friend_activity_feed` (0008_activity_events.sql), plus reaction state layered on client-side. */
export interface ActivityEvent {
  id: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  eventType: ActivityEventType;
  payload: Record<string, unknown>;
  createdAt: string;
  reactionCount: number;
  reactedByMe: boolean;
}

/** A row from `get_activity_comments` (0012_activity_comments.sql). */
export interface ActivityComment {
  id: string;
  eventId: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  body: string;
  createdAt: string;
}
