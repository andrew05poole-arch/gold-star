import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily } from '@/lib/theme';
import { Text } from './Text';
import { rankDelta } from '@/lib/format';

interface Props {
  rank: number;
  previousRank: number;
}

export function RankChangeArrow({ rank, previousRank }: Props) {
  const delta = rankDelta(rank, previousRank);
  if (delta.direction === 'flat') {
    return (
      <View style={styles.row}>
        <Ionicons name="remove" size={14} color={colors.textSecondary} />
      </View>
    );
  }
  const up = delta.direction === 'up';
  const color = up ? colors.secondary : colors.danger;
  return (
    <View style={styles.row}>
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={14} color={color} />
      <Text style={[styles.amount, { color }]}>{delta.amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 28, justifyContent: 'flex-end' },
  amount: { fontFamily: fontFamily.extraBold, fontSize: 13 },
});
