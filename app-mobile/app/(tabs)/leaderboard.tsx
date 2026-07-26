import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { nextWeeklyResetMs } from '@/lib/mockData';
import {
  getLeaderboard,
  addFriendByEmail,
  getPendingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
} from '@/lib/api/leaderboard';
import { useAuth } from '@/lib/useAuth';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LeaderboardRow } from '@/components/LeaderboardRow';
import { CountdownPill } from '@/components/CountdownPill';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import type { Friend, PendingFriendRequest } from '@/lib/types';

export default function Leaderboard() {
  const { session } = useAuth();
  const [leaderboard, setLeaderboard] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const refresh = useCallback(() => {
    getLeaderboard().then(setLeaderboard).catch(() => {});
    getPendingFriendRequests().then(setPendingRequests).catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  async function handleInvite() {
    setInviteError(null);
    setInviting(true);
    try {
      await addFriendByEmail(inviteEmail.trim());
      setInviteEmail('');
      setInviteOpen(false);
      refresh();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not send that request.');
    } finally {
      setInviting(false);
    }
  }

  async function handleRespond(requesterId: string, accept: boolean) {
    setRespondingTo(requesterId);
    try {
      if (accept) {
        await acceptFriendRequest(requesterId);
      } else {
        await declineFriendRequest(requesterId);
      }
      setPendingRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
      if (accept) refresh();
    } catch {
      // Leave the request in the list so the user can retry.
    } finally {
      setRespondingTo(null);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <CountdownPill getRemaining={() => nextWeeklyResetMs()} />
      </View>

      {pendingRequests.length > 0 && (
        <View style={styles.requests}>
          <Text style={styles.requestsTitle}>Friend requests</Text>
          {pendingRequests.map((req) => (
            <View key={req.requesterId} style={styles.requestRow}>
              <Avatar name={req.displayName} color={req.avatarColor} size={36} />
              <Text style={styles.requestName}>{req.displayName}</Text>
              <View style={styles.requestActions}>
                <PrimaryButton
                  label="Accept"
                  onPress={() => handleRespond(req.requesterId, true)}
                  loading={respondingTo === req.requesterId}
                  disabled={respondingTo !== null && respondingTo !== req.requesterId}
                  style={styles.requestBtn}
                />
                <PrimaryButton
                  label="Decline"
                  variant="ghost"
                  onPress={() => handleRespond(req.requesterId, false)}
                  loading={false}
                  disabled={respondingTo !== null}
                  style={styles.requestBtn}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.list}>
        {leaderboard.map((friend) => (
          <LeaderboardRow key={friend.id} friend={friend} isCurrentUser={friend.id === session?.user.id} />
        ))}
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>More friends = more fun</Text>
        <Text style={styles.inviteSub}>Invite friends to climb the league together.</Text>
        {inviteOpen ? (
          <>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="friend@example.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.inviteInput}
            />
            {inviteError && <Text style={styles.inviteError}>{inviteError}</Text>}
            <PrimaryButton
              label="Send request"
              onPress={handleInvite}
              loading={inviting}
              disabled={!inviteEmail.includes('@')}
              style={styles.inviteBtn}
            />
          </>
        ) : (
          <PrimaryButton label="Invite friends" onPress={() => setInviteOpen(true)} style={styles.inviteBtn} />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginTop: spacing.sm },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary },
  requests: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  requestsTitle: { fontFamily: fontFamily.extraBold, fontSize: 15, color: colors.textPrimary },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  requestName: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, color: colors.textPrimary },
  requestActions: { flexDirection: 'row', gap: spacing.xs },
  requestBtn: { height: 40, paddingHorizontal: spacing.sm },
  list: { gap: spacing.sm },
  inviteCard: {
    backgroundColor: '#FFF3D9',
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  inviteTitle: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  inviteSub: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  inviteBtn: { marginTop: spacing.sm, alignSelf: 'stretch' },
  inviteInput: {
    height: 48,
    width: '100%',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  inviteError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
});
