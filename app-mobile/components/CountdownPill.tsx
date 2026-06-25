import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { formatCountdown } from '@/lib/format';
import { Text } from './Text';

interface Props {
  /** Function returning ms remaining; re-evaluated each minute. */
  getRemaining: () => number;
}

export function CountdownPill({ getRemaining }: Props) {
  const [remaining, setRemaining] = useState(getRemaining());

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining()), 60_000);
    return () => clearInterval(id);
  }, [getRemaining]);

  return (
    <View style={styles.pill}>
      <Ionicons name="time-outline" size={14} color={colors.primary} />
      <Text style={styles.text}>Resets in {formatCountdown(remaining)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFEDE7',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  text: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary },
});
