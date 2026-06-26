import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  days: number;
  size?: number;
}

/** Flame + streak number. Color intensifies at milestones. */
export function StreakFlame({ days, size = 22 }: Props) {
  const color = days >= 30 ? colors.accent : days >= 7 ? colors.primary : colors.primaryDark;
  return (
    <View style={styles.pill}>
      <Ionicons name="flame" size={size} color={color} />
      <Text style={[styles.count, { color }]}>{days}</Text>
      <Text style={styles.label}>day streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  count: { fontFamily: fontFamily.extraBold, fontSize: 20 },
  label: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textSecondary },
});
