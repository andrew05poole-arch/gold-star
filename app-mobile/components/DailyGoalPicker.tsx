import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { formatSteps } from '@/lib/format';
import { updateDailyGoal } from '@/lib/api/profile';
import { errorMessage } from '@/lib/errorMessage';
import { Text } from './Text';

/** Preset options offered by the picker — deliberately not exhaustive, just sensible round numbers around the schema default (10,000). */
const PRESET_GOALS = [5000, 8000, 10000, 12000, 15000];

interface Props {
  dailyGoal: number;
  /** Called after a preset is successfully persisted, with the new goal. */
  onChange: (dailyGoal: number) => void;
}

/**
 * Preset-chip picker for `profiles.daily_goal`. Before this, the only write
 * path was the auto-applied suggested goal from onboarding's historical
 * import (see lib/api/profile.ts) — a user who skips import is stuck at the
 * schema default (10,000) with no way to change it.
 */
export function DailyGoalPicker({ dailyGoal, onChange }: Props) {
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(goal: number) {
    if (goal === dailyGoal || saving != null) return;
    setError(null);
    setSaving(goal);
    try {
      await updateDailyGoal(goal);
      onChange(goal);
    } catch (err) {
      setError(errorMessage(err, 'Could not update your goal.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <View>
      <View style={styles.chipRow}>
        {PRESET_GOALS.map((goal) => {
          const active = goal === dailyGoal;
          return (
            <Pressable
              key={goal}
              onPress={() => handleSelect(goal)}
              disabled={saving != null}
              style={[styles.chip, active && styles.chipActive, saving != null && !active && styles.chipDisabled]}
            >
              {saving === goal ? (
                <ActivityIndicator size="small" color={active ? '#FFFFFF' : colors.primary} />
              ) : (
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{formatSteps(goal)}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.5 },
  chipLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textPrimary },
  chipLabelActive: { color: '#FFFFFF' },
  error: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.sm },
});
