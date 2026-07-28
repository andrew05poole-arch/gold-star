import { supabase } from '../supabase';
import { getMyProfile } from './profile';
import type { ActivityComment, ActivityEvent, ActivityEventType } from '../types';

interface ActivityFeedRow {
  id: string;
  user_id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  event_type: ActivityEventType;
  payload: Record<string, unknown>;
  created_at: string;
}

interface ReactionCountRow {
  event_id: string;
  reaction_count: number;
  reacted_by_me: boolean;
}

interface CommentRow {
  id: string;
  user_id: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  body: string;
  created_at: string;
}

/**
 * Friends' (+ own) activity feed, newest first, with reaction counts merged
 * in. `get_friend_activity_feed` (0008_activity_events.sql) doesn't include
 * reaction data itself, so this batches a follow-up call to
 * `get_activity_reaction_counts` (0011_activity_reactions.sql) for every
 * returned event id rather than the caller doing N+1 round trips.
 */
export async function getFriendActivityFeed(): Promise<ActivityEvent[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data, error } = await supabase.rpc('get_friend_activity_feed', { p_user_id: auth.user.id });
  if (error) throw error;
  const rows = (data as ActivityFeedRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const counts = await getReactionCounts(rows.map((r) => r.id));
  const countsById = new Map(counts.map((c) => [c.eventId, c]));

  return rows.map((row) => {
    const counted = countsById.get(row.id);
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      avatarColor: row.avatar_color,
      avatarUrl: row.avatar_url ?? undefined,
      eventType: row.event_type,
      payload: row.payload ?? {},
      createdAt: row.created_at,
      reactionCount: counted?.reactionCount ?? 0,
      reactedByMe: counted?.reactedByMe ?? false,
    };
  });
}

/** Likes/unlikes an activity event. Returns the caller's new reaction state + updated count. */
export async function toggleReaction(eventId: string): Promise<{ reacted: boolean; reactionCount: number }> {
  const { data, error } = await supabase.rpc('toggle_activity_reaction', { p_event_id: eventId });
  if (error) throw error;
  const row = (data as { reacted: boolean; reaction_count: number }[] | null)?.[0];
  return { reacted: row?.reacted ?? false, reactionCount: row?.reaction_count ?? 0 };
}

/** Batch reaction counts + "did I react" for a page of event ids. */
export async function getReactionCounts(
  eventIds: string[],
): Promise<{ eventId: string; reactionCount: number; reactedByMe: boolean }[]> {
  if (eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_activity_reaction_counts', { p_event_ids: eventIds });
  if (error) throw error;
  return ((data as ReactionCountRow[] | null) ?? []).map((row) => ({
    eventId: row.event_id,
    reactionCount: Number(row.reaction_count),
    reactedByMe: row.reacted_by_me,
  }));
}

/** All comments on an event the caller can see (self or accepted friend), oldest first. */
export async function getComments(eventId: string): Promise<ActivityComment[]> {
  const { data, error } = await supabase.rpc('get_activity_comments', { p_event_id: eventId });
  if (error) throw error;
  return ((data as CommentRow[] | null) ?? []).map((row) => ({
    id: row.id,
    eventId,
    userId: row.user_id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url ?? undefined,
    body: row.body,
    createdAt: row.created_at,
  }));
}

interface NewCommentRow {
  id: string;
  event_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

/**
 * Adds a comment (<=280 chars) to an event the caller can see. `add_activity_comment`
 * (0012_activity_comments.sql) returns the bare `activity_comments` row (no joined
 * display info, unlike `get_activity_comments`) — since a caller can only ever add a
 * comment as themselves, this fills in `displayName`/`avatarColor` from their own
 * profile rather than making a second round trip.
 */
export async function addComment(eventId: string, body: string): Promise<ActivityComment> {
  const [{ data, error }, profile] = await Promise.all([
    supabase.rpc('add_activity_comment', { p_event_id: eventId, p_body: body }),
    getMyProfile(),
  ]);
  if (error) throw error;
  const row = data as NewCommentRow;
  return {
    id: row.id,
    eventId,
    userId: row.user_id,
    displayName: profile?.displayName ?? 'You',
    avatarColor: profile?.avatarColor ?? '#7C6FFF',
    avatarUrl: profile?.avatarUrl,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Deletes a comment the caller owns. */
export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_activity_comment', { p_comment_id: commentId });
  if (error) throw error;
}
