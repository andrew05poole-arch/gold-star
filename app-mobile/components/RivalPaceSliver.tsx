import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import type { RivalStatus } from '@/lib/types';
import { formatSteps } from '@/lib/format';
import { Text } from './Text';

interface Props {
  rival: RivalStatus;
}

/** Compact "today's gap vs rival" indicator for the Home dashboard. */
export function RivalPaceSliver({ rival }: Props) {
  const gap = rival.yourSteps - rival.rivalSteps;
  const ahead = gap >= 0;
  const color = ahead ? colors.secondary : colors.danger;
  return (
    <View style={styles.row}>
      <Ionicons name={ahead ? 'trending-up' : 'trending-down'} size={18} color={color} />
      <Text style={styles.text}>
        {ahead ? "You're " : 'Rival is '}
        <Text style={[styles.amount, { color }]}>{formatSteps(Math.abs(gap))}</Text>
        {ahead ? ' steps ahead of ' : ' steps ahead of you · '}
        {ahead ? rival.name : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textPrimary, flex: 1 },
  amount: { fontFamily: fontFamily.extraBold },
});
