import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { localDateKey } from '@/lib/dateRange';
import type { Challenge } from '@/lib/types';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

interface Props {
  challenge: Challenge;
  onJoin?: (id: string) => void;
}

const STATUS_BADGE: Record<
  'upcoming' | 'completed' | 'expired',
  { label: string; color: string; icon: 'trophy' | 'time-outline' | 'calendar-outline' }
> = {
  upcoming: { label: 'Upcoming', color: colors.rivalAccent, icon: 'calendar-outline' },
  completed: { label: 'Completed', color: colors.secondary, icon: 'trophy' },
  expired: { label: 'Expired', color: colors.textSecondary, icon: 'time-outline' },
};

export function ChallengeCard({ challenge, onJoin }: Props) {
  const router = useRouter();
  const isActive = challenge.variant === 'active';
  const badge = challenge.status && challenge.status !== 'active' ? STATUS_BADGE[challenge.status] : null;
  // Scheduled-but-not-yet-started, and I haven't joined — string comparison
  // is safe since both sides are "YYYY-MM-DD" local date keys, which sort
  // lexically the same as chronologically.
  const startsInFuture = !isActive && challenge.startsAt > localDateKey(new Date());

  // Only already-joined challenges (active/completed/expired) navigate to
  // the detail screen on tap. Joinable cards keep their plain "Join
  // challenge" button as the sole tap target — nesting a Pressable card
  // around that button would also fire the card's onPress on web (DOM click
  // events bubble there, unlike native's single-responder gesture system).
  return (
    <Card
      onPress={isActive ? () => router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } }) : undefined}
    >
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.subtitle}>{challenge.subtitle}</Text>
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: `${badge.color}22` }]}>
            <Ionicons name={badge.icon} size={14} color={badge.color} />
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        ) : startsInFuture ? (
          <View style={[styles.badge, { backgroundColor: `${colors.rivalAccent}22` }]}>
            <Ionicons name="calendar-outline" size={14} color={colors.rivalAccent} />
            <Text style={[styles.badgeText, { color: colors.rivalAccent }]}>Starts {challenge.startsAt}</Text>
          </View>
        ) : isActive ? (
          <Ionicons name="trophy" size={22} color={colors.accent} />
        ) : (
          <View style={styles.participants}>
            <Ionicons name="people" size={14} color={colors.textSecondary} />
            <Text style={styles.participantsText}>{challenge.participants}</Text>
          </View>
        )}
      </View>

      {isActive ? (
        challenge.status === 'upcoming' ? (
          <Text variant="caption" style={styles.upcomingNote}>
            Starts {challenge.startsAt} — you're in, come back then.
          </Text>
        ) : (
          <View style={styles.progressWrap}>
            <ProgressBar value={challenge.progress} color={badge ? badge.color : colors.primary} />
            <Text style={styles.pct}>{Math.round(challenge.progress * 100)}%</Text>
          </View>
        )
      ) : (
        <PrimaryButton
          label={startsInFuture ? 'Join now' : 'Join challenge'}
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
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 12 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  pct: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.primary, width: 44, textAlign: 'right' },
  joinBtn: { height: 44, marginTop: spacing.md },
  upcomingNote: { marginTop: spacing.md },
});
