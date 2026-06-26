import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { rival } from '@/lib/mockData';
import { formatSteps } from '@/lib/format';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StepCounter } from '@/components/StepCounter';
import { StreakFlame } from '@/components/StreakFlame';
import { ProgressBar } from '@/components/ProgressBar';
import { RivalPaceSliver } from '@/components/RivalPaceSliver';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';

export default function Home() {
  const { data, isLoading } = useStepData();

  if (isLoading || !data) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  const goalPct = data.todaySteps / data.dailyGoal;
  const remaining = Math.max(0, data.dailyGoal - data.todaySteps);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.greeting}>Today</Text>
        <StreakFlame days={data.streakDays} />
      </View>

      <Card style={styles.counterCard}>
        <StepCounter steps={data.todaySteps} />
        <View style={styles.goalRow}>
          <ProgressBar value={goalPct} />
          <Text style={styles.goalPct}>{Math.round(goalPct * 100)}%</Text>
        </View>
        <Text style={styles.goalText}>
          {remaining > 0
            ? `${formatSteps(remaining)} steps to your ${formatSteps(data.dailyGoal)} goal`
            : `Goal smashed! ${formatSteps(data.dailyGoal)} 🎉`}
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardLabel}>TODAY VS RIVAL</Text>
        <RivalPaceSliver rival={rival} />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  greeting: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary },
  counterCard: { alignItems: 'center', gap: spacing.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  goalPct: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.primary, width: 44, textAlign: 'right' },
  goalText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textSecondary },
  cardLabel: { fontFamily: fontFamily.extraBold, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
});
