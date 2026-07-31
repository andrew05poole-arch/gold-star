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
  avatarUrl?: string;
  bio?: string;
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
  avatarUrl?: string;
  weeklySteps: number;
  rank: number;
  previousRank: number;
}

/** An incoming, not-yet-accepted friend request. */
export interface PendingFriendRequest {
  requesterId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
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
 *
 * 'upcoming': joined (or joinable) but the shared window hasn't opened yet —
 * see 0015_scheduled_challenges.sql. Only possible for a scheduled
 * challenge (starts_at in the future); an instant challenge goes straight
 * to 'active'.
 */
export type ChallengeStatus = 'upcoming' | 'active' | 'completed' | 'expired';

/** Mirrors `challenges.visibility` in supabase/migrations/0020_challenge_visibility_invites.sql. */
export type ChallengeVisibility = 'public' | 'invite_only';

export interface Challenge {
  id: string;
  title: string;
  subtitle: string;
  variant: ChallengeVariant;
  status?: ChallengeStatus; // set when variant === 'active'
  progress: number; // 0..1, used when variant === 'active'
  participants: number;
  startsAt: string; // local date key; in the future for a scheduled/"queued" challenge
  visibility: ChallengeVisibility;
}

/** One participant's own progress within a challenge, for the detail screen's member leaderboard. See app/challenge/[id].tsx. */
export interface ChallengeMember {
  userId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  progress: number; // raw value, same unit as ChallengeDetail.goalValue
  status: ChallengeStatus;
  joinedAt: string;
  windowStart: string;
  windowEnd: string;
  isMe: boolean;
}

/** Full detail of a single challenge, including every member ranked by progress. */
export interface ChallengeDetail {
  id: string;
  title: string;
  subtitle: string;
  goalType: ChallengeGoalType;
  goalValue: number;
  durationDays: number;
  startsAt: string;
  createdAt: string;
  isOwner: boolean;
  visibility: ChallengeVisibility;
  members: ChallengeMember[]; // ranked by progress, descending
}

/** A pending invite to an invite-only challenge — see app/(tabs)/streaks.tsx's "Invited" section. */
export interface ChallengeInvite {
  challengeId: string;
  challengeTitle: string;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
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
  avatarUrl?: string;
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
  avatarUrl?: string;
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Historical step import (onboarding). See lib/historicalStepImport.ts and
// lib/stepHistorySummary.ts. Mirrors docs/PRD.md §9.1's onboarding sketch,
// extended with a bulk-history-import step not yet described there.
// ---------------------------------------------------------------------------

/** Offered import-period lengths; 30 is the recommended default. */
export type ImportRangeDays = 7 | 30 | 90;

/** Inclusive local-calendar-day range — see lib/dateRange.ts for the exact date/timezone rules. */
export interface HistoricalStepQuery {
  startDate: Date;
  endDate: Date;
}

export type MovementProfileKey =
  | 'steady_mover'
  | 'weekend_warrior'
  | 'weekday_grinder'
  | 'high_volume_walker'
  | 'building_momentum'
  | 'getting_started';

export interface MovementProfile {
  key: MovementProfileKey;
  displayName: string;
  explanation: string;
}

/**
 * Onboarding personal-stats summary computed from imported history. All
 * numeric comparisons are `null` when they can't be honestly calculated
 * (insufficient data) rather than a misleading 0 — see
 * lib/stepHistorySummary.ts for the calculation rules.
 */
export interface HistoricalStepSummary {
  periodStart: string; // local date key, inclusive
  periodEnd: string; // local date key, inclusive
  daysWithData: number;
  totalSteps: number;
  averageDailySteps: number | null;
  currentWeekSteps: number;
  previousWeekSteps: number;
  weekOverWeekPercent: number | null;
  bestDay: { date: string; steps: number } | null;
  weekdayAverage: number | null;
  weekendAverage: number | null;
  suggestedDailyGoal: number | null;
  /** Always null until real league/benchmark data exists — see estimateStarterLeague(). */
  estimatedLeague: string | null;
  movementProfile: MovementProfile | null;
}

/**
 * Terminal outcomes of one import attempt. Distinct from the transient
 * 'importing' UI phase, which is local onboarding-screen state, not a
 * service result — see app/onboarding.tsx.
 */
export type HistoricalImportStatus = 'completed' | 'partial' | 'no-data' | 'permission-denied' | 'failed';

export interface HistoricalImportResult {
  status: HistoricalImportStatus;
  importedDays: number; // newly-inserted rows
  updatedDays: number; // existing rows overwritten by a re-import
  skippedDays: number; // fetched but invalid/unusable (e.g. negative steps)
  startDate: string;
  endDate: string;
  summary?: HistoricalStepSummary;
}

// ---------------------------------------------------------------------------
// Public profile pages. See lib/api/profile.ts's getPublicProfile and
// app/profile/[userId].tsx. League/leaderboard placement is deliberately
// not included — see 0018_public_profile_streaks.sql's header comment.
// ---------------------------------------------------------------------------

export interface PublicChallengeHistoryItem {
  title: string;
  goalType: ChallengeGoalType;
  goalValue: number;
  progress: number;
  status: ChallengeStatus;
}

/** The signed-in caller's relationship to a profile's owner — see get_friend_request logic in 0022_friend_request_from_profile.sql. */
export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  bio?: string;
  memberSince: string; // profiles.created_at
  currentStreak: number;
  longestStreak: number;
  challengeHistory: PublicChallengeHistoryItem[]; // most recently joined first
  followerCount: number;
  isFollowing: boolean; // true if the signed-in caller follows this profile
  friendCount: number;
  friendshipStatus: FriendshipStatus;
}

/** Friends / followers / following counts for the signed-in user's own profile tab. */
export interface SocialCounts {
  friends: number;
  followers: number;
  following: number;
}
