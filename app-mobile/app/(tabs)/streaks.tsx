import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { getMyStreak, getMyStreakDays } from '@/lib/api/streaks';
import { getChallenges, joinChallenge, createChallenge } from '@/lib/api/challenges';
import { addLocalDays, localDateKey, nextOccurrenceOfWeekday } from '@/lib/dateRange';
import { errorMessage } from '@/lib/errorMessage';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StreakCalendar } from '@/components/StreakCalendar';
import { StreakFlame } from '@/components/StreakFlame';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { Challenge, ChallengeGoalType, StreakDay } from '@/lib/types';

const GOAL_TYPES: { value: ChallengeGoalType; label: string }[] = [
  { value: 'stepsPerDay', label: 'Steps/day' },
  { value: 'totalSteps', label: 'Total steps' },
  { value: 'daysStreak', label: 'Day streak' },
];

const SATURDAY = 6;

type StartPreset = 'now' | 'tomorrow' | 'saturday' | 'week';

const START_PRESETS: { value: StartPreset; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'saturday', label: 'This Saturday' },
  { value: 'week', label: 'In 1 week' },
];

/** Resolves a start preset to a local date key, or undefined for 'now' — see createChallenge's doc comment for why 'now' is omitted rather than sent explicitly. */
function resolveStartPreset(preset: StartPreset, now: Date): string | undefined {
  switch (preset) {
    case 'tomorrow':
      return localDateKey(addLocalDays(now, 1));
    case 'saturday':
      return localDateKey(nextOccurrenceOfWeekday(SATURDAY, now));
    case 'week':
      return localDateKey(addLocalDays(now, 7));
    default:
      return undefined;
  }
}

export default function Streaks() {
  const { data } = useStepData();
  const [streakLength, setStreakLength] = useState(0);
  const [streakDays, setStreakDays] = useState<StreakDay[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoalType, setNewGoalType] = useState<ChallengeGoalType>('stepsPerDay');
  const [newGoalValue, setNewGoalValue] = useState('');
  const [newDurationDays, setNewDurationDays] = useState('');
  const [newStartPreset, setNewStartPreset] = useState<StartPreset>('now');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const active = challenges.filter((c) => c.variant === 'active' && c.status === 'active');
  const finished = challenges.filter((c) => c.variant === 'active' && c.status !== 'active');
  const joinable = challenges.filter((c) => c.variant === 'joinable');

  async function handleJoin(id: string) {
    await joinChallenge(id);
    refreshChallenges();
  }

  function resetCreateForm() {
    setNewTitle('');
    setNewGoalType('stepsPerDay');
    setNewGoalValue('');
    setNewDurationDays('');
    setNewStartPreset('now');
    setCreateError(null);
  }

  const goalValueNum = Number(newGoalValue);
  const durationNum = Number(newDurationDays);
  const canCreate =
    newTitle.trim().length > 0 &&
    Number.isFinite(goalValueNum) &&
    goalValueNum > 0 &&
    Number.isFinite(durationNum) &&
    durationNum > 0;

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    try {
      const startsAt = resolveStartPreset(newStartPreset, new Date());
      await createChallenge(newTitle.trim(), newGoalType, goalValueNum, Math.round(durationNum), startsAt);
      resetCreateForm();
      setCreateOpen(false);
      refreshChallenges();
    } catch (e) {
      setCreateError(errorMessage(e, 'Could not create that challenge.'));
    } finally {
      setCreating(false);
    }
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

      {finished.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Challenge history</Text>
          {finished.map((c) => (
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create your own</Text>
        <Card style={styles.createCard}>
          {createOpen ? (
            <>
              <Text variant="label">TITLE</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="e.g. 10k a day for a week"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />

              <Text variant="label" style={styles.fieldLabel}>GOAL TYPE</Text>
              <View style={styles.goalTypeSelector}>
                {GOAL_TYPES.map(({ value, label }) => {
                  const active = value === newGoalType;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.goalTypeOption, active && styles.goalTypeOptionActive]}
                      onPress={() => setNewGoalType(value)}
                    >
                      <Text style={[styles.goalTypeOptionText, active && styles.goalTypeOptionTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text variant="label" style={styles.fieldLabel}>GOAL VALUE</Text>
              <TextInput
                value={newGoalValue}
                onChangeText={setNewGoalValue}
                placeholder="e.g. 10000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text variant="label" style={styles.fieldLabel}>DURATION (DAYS)</Text>
              <TextInput
                value={newDurationDays}
                onChangeText={setNewDurationDays}
                placeholder="e.g. 7"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                style={styles.input}
              />

              <Text variant="label" style={styles.fieldLabel}>START</Text>
              <View style={styles.goalTypeSelector}>
                {START_PRESETS.map(({ value, label }) => {
                  const active = value === newStartPreset;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.goalTypeOption, active && styles.goalTypeOptionActive]}
                      onPress={() => setNewStartPreset(value)}
                    >
                      <Text style={[styles.goalTypeOptionText, active && styles.goalTypeOptionTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {createError && <Text style={styles.createError}>{createError}</Text>}

              <View style={styles.createActions}>
                <PrimaryButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => {
                    resetCreateForm();
                    setCreateOpen(false);
                  }}
                  disabled={creating}
                  style={styles.createActionBtn}
                />
                <PrimaryButton
                  label="Create"
                  onPress={handleCreate}
                  loading={creating}
                  disabled={!canCreate}
                  style={styles.createActionBtn}
                />
              </View>
            </>
          ) : (
            <PrimaryButton label="Create challenge" onPress={() => setCreateOpen(true)} />
          )}
        </Card>
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
  createCard: { gap: spacing.xs },
  fieldLabel: { marginTop: spacing.sm },
  input: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  goalTypeSelector: { flexDirection: 'row', gap: spacing.xs },
  goalTypeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: '#EFEDFF',
  },
  goalTypeOptionActive: { backgroundColor: colors.rivalAccent },
  goalTypeOptionText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.rivalAccent },
  goalTypeOptionTextActive: { color: '#FFFFFF' },
  createError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  createActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  createActionBtn: { flex: 1 },
});
