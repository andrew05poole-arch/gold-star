import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { followUser, getPublicProfile, unfollowUser } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errorMessage';
import { useAuth } from '@/lib/useAuth';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { ChallengeGoalType, ChallengeStatus, PublicProfile } from '@/lib/types';

const GOAL_TYPE_LABEL: Record<ChallengeGoalType, string> = {
  stepsPerDay: 'steps/day',
  totalSteps: 'total steps',
  daysStreak: 'day streak',
};

const STATUS_COLOR: Record<ChallengeStatus, string> = {
  upcoming: colors.rivalAccent,
  active: colors.primary,
  completed: colors.secondary,
  expired: colors.textSecondary,
};

export default function PublicProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    getPublicProfile(userId)
      .then(setProfile)
      .catch((e) => setError(errorMessage(e, 'Could not load this profile.')))
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleToggleFollow() {
    if (!profile || !userId) return;
    setFollowLoading(true);
    const wasFollowing = profile.isFollowing;
    try {
      if (wasFollowing) {
        await unfollowUser(userId);
      } else {
        await followUser(userId);
      }
      setProfile((prev) =>
        prev
          ? { ...prev, isFollowing: !wasFollowing, followerCount: prev.followerCount + (wasFollowing ? -1 : 1) }
          : prev,
      );
    } catch {
      // Leave state as-is so the user can retry.
    } finally {
      setFollowLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading">Profile</Text>
        <View style={styles.backBtn} />
      </View>

      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {!loading && error && (
        <Card>
          <Text variant="body">{error}</Text>
        </Card>
      )}

      {!loading && profile && (
        <>
          <Card style={styles.headerCard}>
            <Avatar name={profile.displayName} color={profile.avatarColor} photoUrl={profile.avatarUrl} size={72} />
            <View style={styles.headerInfo}>
              <Text variant="title">{profile.displayName}</Text>
              <Text variant="caption">Member since {profile.memberSince.slice(0, 10)}</Text>
              <Text variant="caption">
                {profile.followerCount} {profile.followerCount === 1 ? 'follower' : 'followers'}
              </Text>
            </View>
          </Card>

          {profile.id !== session?.user.id && (
            <PrimaryButton
              label={profile.isFollowing ? 'Following' : 'Follow'}
              variant={profile.isFollowing ? 'ghost' : 'primary'}
              onPress={handleToggleFollow}
              loading={followLoading}
            />
          )}

          {!!profile.bio && (
            <Card>
              <Text variant="body">{profile.bio}</Text>
            </Card>
          )}

          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text variant="label">CURRENT STREAK</Text>
              <Text variant="title">{profile.currentStreak}</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text variant="label">LONGEST STREAK</Text>
              <Text variant="title">{profile.longestStreak}</Text>
            </Card>
          </View>

          <View style={styles.section}>
            <Text variant="heading">Challenge history</Text>
            {profile.challengeHistory.length === 0 && <Text variant="body">No challenges joined yet.</Text>}
            {profile.challengeHistory.map((item, i) => (
              <Card key={`${item.title}-${i}`} style={styles.challengeCard}>
                <View style={styles.challengeRow}>
                  <View style={styles.challengeInfo}>
                    <Text style={styles.challengeTitle}>{item.title}</Text>
                    <Text variant="caption">
                      {item.progress.toLocaleString()} / {item.goalValue.toLocaleString()} {GOAL_TYPE_LABEL[item.goalType]}
                    </Text>
                  </View>
                  <Text style={[styles.challengeStatus, { color: STATUS_COLOR[item.status] }]}>{item.status}</Text>
                </View>
              </Card>
            ))}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerInfo: { gap: spacing.xs },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.sm },
  challengeCard: { paddingVertical: spacing.md },
  challengeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  challengeInfo: { gap: 2 },
  challengeTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.textPrimary },
  challengeStatus: { fontFamily: fontFamily.extraBold, fontSize: 13, textTransform: 'capitalize' },
});
