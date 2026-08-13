import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { getRivalStatus } from '@/lib/api/rival';
import { getMyStreak } from '@/lib/api/streaks';
import { rival as fallbackRival } from '@/lib/mockData';
import { errorMessage } from '@/lib/errorMessage';
import { formatSteps } from '@/lib/format';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StepCounter } from '@/components/StepCounter';
import { StreakFlame } from '@/components/StreakFlame';
import { ProgressBar } from '@/components/ProgressBar';
import { RivalPaceSliver } from '@/components/RivalPaceSliver';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import type { RivalStatus } from '@/lib/types';

export default function Home() {
  const { data, isLoading } = useStepData();
  const [rival, setRival] = useState<RivalStatus>(fallbackRival);
  const [rivalError, setRivalError] = useState<string | null>(null);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [streakError, setStreakError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const todayNormalized = data.weeklyHistory[data.weeklyHistory.length - 1]?.normalizedSteps ?? data.todaySteps;
    getRivalStatus(todayNormalized)
      .then((r) => {
        setRival(r);
        setRivalError(null);
      })
      .catch((e) => setRivalError(errorMessage(e, "Couldn't load your rival.")));
    getMyStreak()
      .then((streak) => {
        setStreakDays(streak.currentLength);
        setStreakError(null);
      })
      .catch((e) => {
        // Do NOT fall back to the mock provider's streakDays here — that
        // would silently show fabricated data as if it were the user's real
        // streak. Surface a neutral "—" (via StreakFlame's null handling)
        // plus a small error note instead, matching the errorMessage +
        // inline-Text convention used for other tabs' load failures.
        setStreakDays(null);
        setStreakError(errorMessage(e, "Couldn't load your streak."));
      });
  }, [data]);

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
        <StreakFlame days={streakDays} />
      </View>
      {streakError && <Text style={styles.streakError}>{streakError}</Text>}

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
        {rivalError && <Text style={styles.rivalError}>{rivalError}</Text>}
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
  streakError: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.danger,
    textAlign: 'right',
    marginTop: -spacing.xs,
  },
  counterCard: { alignItems: 'center', gap: spacing.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  goalPct: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.primary, width: 44, textAlign: 'right' },
  goalText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textSecondary },
  cardLabel: { fontFamily: fontFamily.extraBold, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  rivalError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginBottom: spacing.sm },
});
