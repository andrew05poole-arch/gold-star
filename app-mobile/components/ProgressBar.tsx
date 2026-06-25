import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/lib/theme';

interface Props {
  value: number; // 0..1
  color?: string;
  trackColor?: string;
  height?: number;
}

export function ProgressBar({ value, color = colors.primary, trackColor = colors.border, height = 14 }: Props) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: radii.full }]}>
      <View style={[styles.fill, { backgroundColor: color, width: `${pct * 100}%`, borderRadius: radii.full }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
