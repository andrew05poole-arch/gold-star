import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import type { Challenge } from '@/lib/types';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

interface Props {
  challenge: Challenge;
  onJoin?: (id: string) => void;
}

export function ChallengeCard({ challenge, onJoin }: Props) {
  const isActive = challenge.variant === 'active';
  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.subtitle}>{challenge.subtitle}</Text>
        </View>
        {isActive ? (
          <Ionicons name="trophy" size={22} color={colors.accent} />
        ) : (
          <View style={styles.participants}>
            <Ionicons name="people" size={14} color={colors.textSecondary} />
            <Text style={styles.participantsText}>{challenge.participants}</Text>
          </View>
        )}
      </View>

      {isActive ? (
        <View style={styles.progressWrap}>
          <ProgressBar value={challenge.progress} color={colors.primary} />
          <Text style={styles.pct}>{Math.round(challenge.progress * 100)}%</Text>
        </View>
      ) : (
        <PrimaryButton
          label="Join challenge"
          variant="secondary"
          onPress={() => onJoin?.(challenge.id)}
          style={styles.joinBtn}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleWrap: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.extraBold, fontSize: 17, color: colors.textPrimary },
  subtitle: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textSecondary },
  participants: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  participantsText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textSecondary },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  pct: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.primary, width: 44, textAlign: 'right' },
  joinBtn: { height: 44, marginTop: spacing.md },
});
