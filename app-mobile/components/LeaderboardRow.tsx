import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import type { Friend } from '@/lib/types';
import { formatSteps } from '@/lib/format';
import { Avatar } from './Avatar';
import { RankChangeArrow } from './RankChangeArrow';
import { Text } from './Text';

interface Props {
  friend: Friend;
  isCurrentUser?: boolean;
  /** Long-press handler (e.g. offer to remove the friend). Omitted for the current user's own row. */
  onLongPress?: () => void;
}

export function LeaderboardRow({ friend, isCurrentUser, onLongPress }: Props) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.row, isCurrentUser && styles.highlight]}
      onPress={
        isCurrentUser ? undefined : () => router.push({ pathname: '/profile/[userId]', params: { userId: friend.id } })
      }
      onLongPress={isCurrentUser ? undefined : onLongPress}
      delayLongPress={400}
    >
      <Text style={styles.rank}>{friend.rank}</Text>
      <Avatar name={friend.displayName} color={friend.avatarColor} photoUrl={friend.avatarUrl} size={40} />
      <View style={styles.middle}>
        <Text style={styles.name}>{friend.displayName}</Text>
        <Text style={styles.steps}>{formatSteps(friend.weeklySteps)} steps</Text>
      </View>
      <RankChangeArrow rank={friend.rank} previousRank={friend.previousRank} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  highlight: { borderWidth: 2, borderColor: colors.primary },
  rank: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textSecondary, width: 24, textAlign: 'center' },
  middle: { flex: 1 },
  name: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.textPrimary },
  steps: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textSecondary },
});
