import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Share, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { nextWeeklyResetMs } from '@/lib/mockData';
import {
  getLeaderboard,
  getCityLeaderboard,
  getCountryLeaderboard,
  getGlobalLeaderboard,
  addFriendByEmail,
  getPendingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '@/lib/api/leaderboard';
import { getMyProfile } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errorMessage';
import { useAuth } from '@/lib/useAuth';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LeaderboardRow } from '@/components/LeaderboardRow';
import { CountdownPill } from '@/components/CountdownPill';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import type { Friend, PendingFriendRequest, User } from '@/lib/types';

type Scope = 'friends' | 'city' | 'country' | 'global';
type LeaderboardView = 'friends' | 'public';

const VIEWS: { key: LeaderboardView; label: string }[] = [
  { key: 'friends', label: 'Friends' },
  { key: 'public', label: 'Public' },
];

const PUBLIC_SCOPES: { key: Scope; label: string }[] = [
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'global', label: 'Global' },
];

export default function Leaderboard() {
  const { session } = useAuth();
  const [view, setView] = useState<LeaderboardView>('friends');
  const [scope, setScope] = useState<Scope>('friends');
  const [profile, setProfile] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const refreshProfile = useCallback(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setReferralCode(p?.referralCode ?? null);
      })
      .catch(() => {});
  }, []);

  const refreshLeaderboard = useCallback(() => {
    let fetcher: Promise<Friend[]>;
    if (scope === 'friends') {
      fetcher = getLeaderboard();
    } else if (scope === 'city') {
      fetcher = profile?.city ? getCityLeaderboard(profile.city) : Promise.resolve([]);
    } else if (scope === 'country') {
      fetcher = profile?.country ? getCountryLeaderboard(profile.country) : Promise.resolve([]);
    } else {
      fetcher = getGlobalLeaderboard();
    }
    fetcher.then(setLeaderboard).catch(() => {});
  }, [scope, profile?.city, profile?.country]);

  const refresh = useCallback(() => {
    refreshProfile();
    if (view === 'friends') {
      getPendingFriendRequests().then(setPendingRequests).catch(() => {});
    }
  }, [refreshProfile, view]);

  useEffect(refresh, [refresh]);
  useEffect(refreshLeaderboard, [refreshLeaderboard]);

  function handleChangeView(next: LeaderboardView) {
    if (next === view) return;
    setView(next);
    if (next === 'friends') {
      setScope('friends');
    } else if (scope === 'friends') {
      // First time switching to Public this session — default to Global
      // (always available, unlike City/Country which need a set location).
      setScope('global');
    }
  }

  function handleChangeScope(next: Scope) {
    if (next === scope) return;
    if (next === 'city' && !profile?.city) return;
    if (next === 'country' && !profile?.country) return;
    setScope(next);
  }

  async function handleShareInvite() {
    if (!referralCode) return;
    const message = `Join me on StepLeague! Use code ${referralCode} when you sign up.`;
    setSharing(true);
    try {
      // react-native-web's Share.share() is a thin proxy over navigator.share()
      // with no timeout — on desktop browsers without OS share-target support
      // that promise can hang indefinitely, stranding the button in its
      // loading state forever. Clipboard is the reliable path on web; native
      // platforms keep the real OS share sheet below.
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(message);
          Alert.alert('Copied!', 'Invite message copied to your clipboard — paste it anywhere to send.');
        } else {
          Alert.alert('Copy this to invite a friend', message);
        }
      } else {
        await Share.share({ message });
      }
    } catch {
      // User dismissed the share sheet, or the clipboard write was denied — no-op.
    } finally {
      setSharing(false);
    }
  }

  async function handleInvite() {
    setInviteError(null);
    setInviting(true);
    try {
      await addFriendByEmail(inviteEmail.trim());
      setInviteEmail('');
      setInviteOpen(false);
      refresh();
      refreshLeaderboard();
    } catch (e) {
      setInviteError(errorMessage(e, 'Could not send that request.'));
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
      if (accept) refreshLeaderboard();
    } catch {
      // Leave the request in the list so the user can retry.
    } finally {
      setRespondingTo(null);
    }
  }

  function handleRemoveFriend(friend: Friend) {
    Alert.alert('Remove friend?', `${friend.displayName} will be removed from your leaderboard.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeFriend(friend.id);
            refreshLeaderboard();
          } catch {
            Alert.alert('Could not remove friend', 'Please try again.');
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <CountdownPill getRemaining={() => nextWeeklyResetMs()} />
      </View>

      <View style={styles.scopeSelector}>
        {VIEWS.map(({ key, label }) => {
          const active = key === view;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.scopeOption, active && styles.scopeOptionActive]}
              onPress={() => handleChangeView(key)}
            >
              <Text style={[styles.scopeOptionText, active && styles.scopeOptionTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {view === 'public' && (
        <View style={styles.scopeSelector}>
          {PUBLIC_SCOPES.map(({ key, label }) => {
            const active = key === scope;
            const disabled = (key === 'city' && !profile?.city) || (key === 'country' && !profile?.country);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.scopeOption, active && styles.scopeOptionActive, disabled && styles.scopeOptionDisabled]}
                onPress={() => handleChangeScope(key)}
                disabled={disabled}
              >
                <Text
                  style={[
                    styles.scopeOptionText,
                    active && styles.scopeOptionTextActive,
                    disabled && styles.scopeOptionTextDisabled,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {view === 'public' && scope === 'city' && !profile?.city && (
        <Text style={styles.scopeHint}>Set your city on your Profile to see local rankings.</Text>
      )}
      {view === 'public' && scope === 'country' && !profile?.country && (
        <Text style={styles.scopeHint}>Set your country on your Profile to see national rankings.</Text>
      )}

      {view === 'friends' && pendingRequests.length > 0 && (
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
          <LeaderboardRow
            key={friend.id}
            friend={friend}
            isCurrentUser={friend.id === session?.user.id}
            onLongPress={view === 'friends' ? () => handleRemoveFriend(friend) : undefined}
          />
        ))}
      </View>

      {view === 'friends' && (
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
                label="Send friend request"
                onPress={handleInvite}
                loading={inviting}
                disabled={!inviteEmail.includes('@')}
                style={styles.inviteBtn}
              />
            </>
          ) : (
            <PrimaryButton label="Invite friends" onPress={() => setInviteOpen(true)} style={styles.inviteBtn} />
          )}
          <PrimaryButton
            label="Share invite link"
            variant="secondary"
            onPress={handleShareInvite}
            loading={sharing}
            disabled={!referralCode}
            style={styles.inviteBtn}
          />
        </View>
      )}
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
  scopeSelector: { flexDirection: 'row', gap: spacing.xs },
  scopeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: '#EFEDFF',
  },
  scopeOptionActive: { backgroundColor: colors.rivalAccent },
  scopeOptionDisabled: { opacity: 0.4 },
  scopeOptionText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.rivalAccent },
  scopeOptionTextActive: { color: '#FFFFFF' },
  scopeOptionTextDisabled: { color: colors.rivalAccent },
  scopeHint: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
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
