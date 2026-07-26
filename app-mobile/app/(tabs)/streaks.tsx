import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { getMyStreak, getMyStreakDays } from '@/lib/api/streaks';
import { getChallenges, joinChallenge } from '@/lib/api/challenges';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StreakCalendar } from '@/components/StreakCalendar';
import { StreakFlame } from '@/components/StreakFlame';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import type { Challenge, StreakDay } from '@/lib/types';

export default function Streaks() {
  const { data } = useStepData();
  const [streakLength, setStreakLength] = useState(0);
  const [streakDays, setStreakDays] = useState<StreakDay[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);

  const refreshChallenges = useCallback(() => {
    getChallenges().then(setChallenges).catch(() => {});
  }, []);

  useEffect(() => {
    if (!data) return;
    getMyStreak()
      .then((streak) => setStreakLength(streak.currentLength))
      .catch(() => {});
    getMyStreakDays(data.dailyGoal)
      .then(setStreakDays)
      .catch(() => {});
    refreshChallenges();
  }, [data, refreshChallenges]);

  const active = challenges.filter((c) => c.variant === 'active');
  const joinable = challenges.filter((c) => c.variant === 'joinable');

  async function handleJoin(id: string) {
    await joinChallenge(id);
    refreshChallenges();
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Streaks</Text>
        <StreakFlame days={streakLength} />
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
          <ChallengeCard key={c.id} challenge={c} onJoin={handleJoin} />
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
