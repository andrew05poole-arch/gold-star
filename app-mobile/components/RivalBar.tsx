import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { formatSteps } from '@/lib/format';
import { Text } from './Text';

interface Props {
  label: string;
  steps: number;
  max: number;
  color: string;
}

/** One full-width head-to-head bar (you or rival). */
export function RivalBar({ label, steps, max, color }: Props) {
  const pct = max > 0 ? Math.min(1, steps / max) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Text style={styles.steps}>{formatSteps(steps)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { fontFamily: fontFamily.extraBold, fontSize: 16 },
  steps: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  track: { height: 22, borderRadius: radii.full, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.full },
});
