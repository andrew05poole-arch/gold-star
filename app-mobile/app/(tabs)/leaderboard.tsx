import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { leaderboard, nextWeeklyResetMs } from '@/lib/mockData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { LeaderboardRow } from '@/components/LeaderboardRow';
import { CountdownPill } from '@/components/CountdownPill';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';

export default function Leaderboard() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>This Week</Text>
        <CountdownPill getRemaining={() => nextWeeklyResetMs()} />
      </View>

      <View style={styles.list}>
        {leaderboard.map((friend) => (
          <LeaderboardRow key={friend.id} friend={friend} isCurrentUser={friend.id === 'u_me'} />
        ))}
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>More friends = more fun</Text>
        <Text style={styles.inviteSub}>Invite friends to climb the league together.</Text>
        <PrimaryButton label="Invite friends" onPress={() => {}} style={styles.inviteBtn} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginTop: spacing.sm },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary },
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
});
