import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { getFriendActivityFeed, toggleReaction, toggleReshare, getComments, addComment } from '@/lib/api/feed';
import { useAuth } from '@/lib/useAuth';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { ActivityComment, ActivityEvent, ActivityEventType } from '@/lib/types';

/** Must stay in sync with toggle_reshare's allowlist (0023_activity_reshares.sql) — kept here purely as a UX nicety (hide the button where it would just error), not the actual enforcement. */
const RESHAREABLE_TYPES: ActivityEventType[] = ['streak_milestone', 'challenge_completed', 'challenge_joined'];

const CHALLENGE_LINK_TYPES: ActivityEventType[] = ['challenge_completed', 'challenge_joined'];

/** A subset of ActivityEvent that describeEvent/eventIcon need — lets a reshare's nested "original" snapshot (from payload, not a real ActivityEvent) reuse the same rendering logic. */
interface DescribableEvent {
  eventType: ActivityEventType;
  payload: Record<string, unknown>;
  displayName: string;
}

/** Human-readable description of an activity event, derived from event_type + payload. */
function describeEvent(event: DescribableEvent, isSelf: boolean): string {
  const who = isSelf ? 'You' : event.displayName;
  switch (event.eventType) {
    case 'streak_milestone': {
      const length = event.payload.streak_length;
      return `${who} reached a ${length ?? '?'}-day streak!`;
    }
    case 'challenge_completed': {
      const title = event.payload.challenge_title;
      return `${who} completed ${title ?? 'a challenge'}!`;
    }
    case 'challenge_joined': {
      const title = event.payload.challenge_title;
      return `${who} joined ${title ?? 'a challenge'}.`;
    }
    case 'friend_added':
      return `${who} made a new friend.`;
    case 'reshare': {
      const originalName = (event.payload.original_display_name as string | undefined) ?? 'someone';
      return `${who} reshared ${originalName}'s post.`;
    }
    default:
      return `${who} did something new.`;
  }
}

function eventIcon(eventType: ActivityEventType): keyof typeof Ionicons.glyphMap {
  switch (eventType) {
    case 'streak_milestone':
      return 'flame';
    case 'challenge_completed':
      return 'trophy';
    case 'challenge_joined':
      return 'flag';
    case 'friend_added':
      return 'people';
    case 'reshare':
      return 'repeat';
    default:
      return 'star';
  }
}

/** Small tappable "View challenge" row, shown under challenge-linked events (original or reshared) once 0023's challenge_id payload addition is present. */
function ChallengeLink({ challengeId }: { challengeId?: string }) {
  if (!challengeId) return null;
  return (
    <TouchableOpacity
      style={styles.challengeLink}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: challengeId } })}
    >
      <Text style={styles.challengeLinkText}>View challenge</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
    </TouchableOpacity>
  );
}

interface FeedItemProps {
  event: ActivityEvent;
  isSelf: boolean;
  onToggleReaction: (eventId: string) => void;
  onToggleReshare: (eventId: string) => void;
}

function FeedItem({ event, isSelf, onToggleReaction, onToggleReshare }: FeedItemProps) {
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const originalEventType = event.payload.original_event_type as ActivityEventType | undefined;
  const originalPayload = (event.payload.original_payload as Record<string, unknown> | undefined) ?? {};
  const originalDisplayName = (event.payload.original_display_name as string | undefined) ?? 'StepLeague user';

  const loadComments = useCallback(() => {
    setLoadingComments(true);
    getComments(event.id)
      .then((rows) => {
        setComments(rows);
        setCommentCount(rows.length);
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [event.id]);

  function handleToggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && commentCount === null) loadComments();
  }

  async function handlePostComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const newComment = await addComment(event.id, body);
      setComments((prev) => [...prev, newComment]);
      setCommentCount((prev) => (prev ?? 0) + 1);
      setDraft('');
    } catch {
      // Leave the draft in place so the user can retry.
    } finally {
      setPosting(false);
    }
  }

  return (
    <Card style={styles.card}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={isSelf ? 1 : 0.7}
        disabled={isSelf}
        onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: event.userId } })}
      >
        <Avatar name={event.displayName} color={event.avatarColor} photoUrl={event.avatarUrl} size={40} />
        <View style={styles.middle}>
          <View style={styles.descriptionRow}>
            <Ionicons name={eventIcon(event.eventType)} size={14} color={colors.primary} />
            <Text style={styles.description}>{describeEvent(event, isSelf)}</Text>
          </View>
          <Text style={styles.timestamp}>{formatRelativeTime(event.createdAt)}</Text>
        </View>
      </TouchableOpacity>

      {CHALLENGE_LINK_TYPES.includes(event.eventType) && (
        <ChallengeLink challengeId={event.payload.challenge_id as string | undefined} />
      )}

      {event.eventType === 'reshare' && originalEventType && (
        <View style={styles.quotedCard}>
          <TouchableOpacity
            style={styles.quotedRow}
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: '/profile/[userId]',
                params: { userId: event.payload.original_user_id as string },
              })
            }
          >
            <Avatar
              name={originalDisplayName}
              color={(event.payload.original_avatar_color as string) ?? colors.rivalAccent}
              photoUrl={event.payload.original_avatar_url as string | undefined}
              size={32}
            />
            <View style={styles.descriptionRow}>
              <Ionicons name={eventIcon(originalEventType)} size={12} color={colors.primary} />
              <Text style={styles.quotedDescription}>
                {describeEvent({ eventType: originalEventType, payload: originalPayload, displayName: originalDisplayName }, false)}
              </Text>
            </View>
          </TouchableOpacity>
          {CHALLENGE_LINK_TYPES.includes(originalEventType) && (
            <ChallengeLink challengeId={originalPayload.challenge_id as string | undefined} />
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onToggleReaction(event.id)}
          accessibilityLabel={event.reactedByMe ? 'Unlike' : 'Like'}
        >
          <Ionicons
            name={event.reactedByMe ? 'heart' : 'heart-outline'}
            size={18}
            color={event.reactedByMe ? colors.primary : colors.textSecondary}
          />
          <Text style={styles.actionLabel}>{event.reactionCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleToggleExpand}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.actionLabel}>{commentCount ?? ''} {commentCount === 1 ? 'comment' : 'comments'}</Text>
        </TouchableOpacity>
        {RESHAREABLE_TYPES.includes(event.eventType) && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onToggleReshare(event.id)}
            accessibilityLabel={event.resharedByMe ? 'Un-reshare' : 'Reshare'}
          >
            <Ionicons name="repeat" size={18} color={event.resharedByMe ? colors.primary : colors.textSecondary} />
            <Text style={styles.actionLabel}>{event.reshareCount}</Text>
          </TouchableOpacity>
        )}
      </View>

      {expanded && (
        <View style={styles.commentsSection}>
          {loadingComments && <ActivityIndicator color={colors.primary} />}
          {!loadingComments &&
            comments.map((comment) => (
              <TouchableOpacity
                key={comment.id}
                style={styles.commentRow}
                activeOpacity={comment.userId === myUserId ? 1 : 0.7}
                disabled={comment.userId === myUserId}
                onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: comment.userId } })}
              >
                <Avatar name={comment.displayName} color={comment.avatarColor} photoUrl={comment.avatarUrl} size={28} />
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>{comment.displayName}</Text>
                  <Text style={styles.commentText}>{comment.body}</Text>
                </View>
              </TouchableOpacity>
            ))}
          {!loadingComments && comments.length === 0 && (
            <Text style={styles.noComments}>No comments yet — be the first.</Text>
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textSecondary}
              style={styles.commentInput}
              maxLength={280}
              multiline
            />
            <TouchableOpacity
              onPress={handlePostComment}
              disabled={!draft.trim() || posting}
              style={[styles.sendBtn, (!draft.trim() || posting) && styles.sendBtnDisabled]}
            >
              {posting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="send" size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </Card>
  );
}

export default function Feed() {
  const { session } = useAuth();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getFriendActivityFeed()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reconciles after a reshare toggle without the full-screen loading state
  // refresh() shows — reshared/un-reshared events need a genuine refetch
  // (the new post's author info, or its removal, isn't derivable from local
  // state alone), but that shouldn't replace the whole visible list with a
  // spinner for what's a small, single-item action.
  const refreshSilently = useCallback(() => {
    getFriendActivityFeed().then(setEvents).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  async function handleToggleReaction(eventId: string) {
    const previous = events;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, reactedByMe: !e.reactedByMe, reactionCount: e.reactionCount + (e.reactedByMe ? -1 : 1) }
          : e,
      ),
    );
    try {
      const { reacted, reactionCount } = await toggleReaction(eventId);
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, reactedByMe: reacted, reactionCount } : e)));
    } catch {
      setEvents(previous);
    }
  }

  async function handleToggleReshare(eventId: string) {
    const previous = events;
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId
          ? { ...e, resharedByMe: !e.resharedByMe, reshareCount: e.reshareCount + (e.resharedByMe ? -1 : 1) }
          : e,
      ),
    );
    try {
      await toggleReshare(eventId);
      refreshSilently();
    } catch {
      setEvents(previous);
    }
  }

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Feed</Text>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="newspaper-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySub}>
            Invite friends to see their streaks, challenge wins, and milestones show up here.
          </Text>
          <PrimaryButton
            label="Invite friends"
            onPress={() => router.push('/(tabs)/leaderboard')}
            style={styles.emptyBtn}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {events.map((event) => (
            <FeedItem
              key={event.id}
              event={event}
              isSelf={event.userId === session?.user.id}
              onToggleReaction={handleToggleReaction}
              onToggleReshare={handleToggleReshare}
            />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary, marginTop: spacing.sm },
  list: { gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  middle: { flex: 1, gap: 2 },
  descriptionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  description: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, color: colors.textPrimary },
  timestamp: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textSecondary },
  challengeLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  challengeLinkText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primary },
  quotedCard: {
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  quotedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quotedDescription: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textPrimary },
  commentsSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  commentRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  commentBody: { flex: 1 },
  commentAuthor: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textPrimary },
  commentText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textSecondary },
  noComments: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  emptyState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  emptySub: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  emptyBtn: { marginTop: spacing.sm, alignSelf: 'stretch' },
});
