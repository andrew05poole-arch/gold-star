import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import type { StreakDay } from '@/lib/types';
import { Text } from './Text';

interface Props {
  days: StreakDay[];
}

export function StreakCalendar({ days }: Props) {
  return (
    <View style={styles.row}>
      {days.map((day, i) => (
        <View key={`${day.date}-${i}`} style={styles.col}>
          <View
            style={[
              styles.cell,
              day.qualified ? styles.filled : styles.empty,
              day.isToday && styles.today,
            ]}
          >
            {day.qualified ? (
              <Ionicons name="flame" size={18} color="#FFFFFF" />
            ) : (
              <View style={styles.dot} />
            )}
          </View>
          <Text style={styles.label}>{day.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', gap: spacing.xs },
  cell: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.primary },
  empty: { backgroundColor: colors.border },
  today: { borderWidth: 2, borderColor: colors.accent },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary, opacity: 0.4 },
  label: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textSecondary },
});
