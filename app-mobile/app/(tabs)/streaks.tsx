import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { buildStreakDays, challenges } from '@/lib/mockData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StreakCalendar } from '@/components/StreakCalendar';
import { StreakFlame } from '@/components/StreakFlame';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';

export default function Streaks() {
  const streakDays = buildStreakDays();
  const active = challenges.filter((c) => c.variant === 'active');
  const joinable = challenges.filter((c) => c.variant === 'joinable');

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Streaks</Text>
        <StreakFlame days={6} />
      </View>

      <Card style={styles.calendarCard}>
        <Text style={styles.cardLabel}>THIS WEEK</Text>
        <StreakCalendar days={streakDays} />
      </Card>

      {active.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active challenge</Text>
          {active.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Join a challenge</Text>
        {joinable.map((c) => (
          <ChallengeCard key={c.id} challenge={c} onJoin={() => {}} />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary },
  calendarCard: { gap: spacing.md },
  cardLabel: { fontFamily: fontFamily.extraBold, fontSize: 12, color: colors.textSecondary },
  section: { gap: spacing.sm },
  sectionTitle: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
});
