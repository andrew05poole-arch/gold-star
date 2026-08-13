import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { getRivalStatus } from '@/lib/api/rival';
import { getMyStreak } from '@/lib/api/streaks';
import { getChallenges } from '@/lib/api/challenges';
import { rival as fallbackRival } from '@/lib/mockData';
import { errorMessage } from '@/lib/errorMessage';
import { formatSteps, formatRelativeTime } from '@/lib/format';
import { selectPrimaryActiveChallenge } from '@/lib/activeChallenge';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StepCounter } from '@/components/StepCounter';
import { StreakFlame } from '@/components/StreakFlame';
import { ProgressBar } from '@/components/ProgressBar';
import { RivalPaceSliver } from '@/components/RivalPaceSliver';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import type { Challenge, RivalStatus } from '@/lib/types';

// Beyond this age a successful sync is no longer "fresh" — shown as a
// stale-data warning even though the last write-through did succeed.
const STALE_SYNC_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export default function Home() {
  const router = useRouter();
  const { data, isLoading, lastSyncedAt, syncFailed } = useStepData();
  const [rival, setRival] = useState<RivalStatus>(fallbackRival);
  const [rivalError, setRivalError] = useState<string | null>(null);
  const [streakDays, setStreakDays] = useState<number | null>(null);
  const [streakError, setStreakError] = useState<string | null>(null);
  // null = not loaded yet, so the "no active challenge" hint below can wait
  // for the fetch instead of flashing before the real list arrives.
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);

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
    getChallenges()
      .then((list) => {
        setChallenges(list);
        setChallengeError(null);
      })
      .catch((e) => setChallengeError(errorMessage(e, "Couldn't load your challenge.")));
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

  // The background write-through (see lib/useStepData.ts) either hasn't
  // resolved yet (lastSyncedAt still null, syncFailed still false) or has
  // settled one way or the other — never both, since there's a single
  // attempt per mount.
  const syncStale = lastSyncedAt != null && Date.now() - lastSyncedAt.getTime() > STALE_SYNC_THRESHOLD_MS;
  const syncWarning = Boolean(syncFailed) || syncStale;

  const activeChallenge = challenges ? selectPrimaryActiveChallenge(challenges) : null;

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
        {(lastSyncedAt || syncFailed) && (
          <Text style={[styles.syncStatus, syncWarning && styles.syncStatusWarning]}>
            {syncFailed ? 'Sync failed' : `Last synced ${formatRelativeTime(lastSyncedAt!.toISOString())}`}
            {!syncFailed && syncStale ? ' · data may be stale' : ''}
          </Text>
        )}
      </Card>

      <Card>
        <Text style={styles.cardLabel}>TODAY VS RIVAL</Text>
        {rivalError && <Text style={styles.rivalError}>{rivalError}</Text>}
        <RivalPaceSliver rival={rival} />
      </Card>

      {challengeError && <Text style={styles.challengeError}>{challengeError}</Text>}
      {activeChallenge ? (
        <Card
          style={styles.challengeCard}
          onPress={() =>
            router.push({ pathname: '/challenge/[id]', params: { id: activeChallenge.primary.id } })
          }
        >
          <Text style={styles.cardLabel}>ACTIVE CHALLENGE</Text>
          <View style={styles.challengeTitleRow}>
            <Text style={styles.challengeTitle} numberOfLines={1}>
              {activeChallenge.primary.title}
            </Text>
            <Text style={styles.challengePct}>{Math.round(activeChallenge.primary.progress * 100)}%</Text>
          </View>
          <ProgressBar value={activeChallenge.primary.progress} />
          {activeChallenge.extraCount > 0 && (
            <Text style={styles.challengeMore}>+{activeChallenge.extraCount} more active</Text>
          )}
        </Card>
      ) : (
        challenges !== null &&
        !challengeError && <Text style={styles.noChallenge}>No active challenge</Text>
      )}
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
  syncStatus: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.textSecondary },
  syncStatusWarning: { color: colors.danger },
  cardLabel: { fontFamily: fontFamily.extraBold, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },
  rivalError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginBottom: spacing.sm },
  challengeCard: { gap: spacing.sm },
  challengeTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  challengeTitle: { flex: 1, fontFamily: fontFamily.extraBold, fontSize: 16, color: colors.textPrimary },
  challengePct: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.primary },
  challengeMore: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary },
  challengeError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger },
  noChallenge: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
