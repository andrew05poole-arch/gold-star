import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { getRivalStatus, updateDifficultyBand } from '@/lib/api/rival';
import { rival as fallbackRival } from '@/lib/mockData';
import { formatSteps } from '@/lib/format';
import { ScreenContainer } from '@/components/ScreenContainer';
import { RivalBar } from '@/components/RivalBar';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import type { RivalStatus } from '@/lib/types';

const DIFFICULTY_BANDS: RivalStatus['difficultyBand'][] = ['chill', 'even', 'pushy'];

export default function Rival() {
  const { data } = useStepData();
  const [rival, setRival] = useState<RivalStatus>(fallbackRival);
  const [savingBand, setSavingBand] = useState(false);

  useEffect(() => {
    if (!data) return;
    const todayNormalized = data.weeklyHistory[data.weeklyHistory.length - 1]?.normalizedSteps ?? data.todaySteps;
    getRivalStatus(todayNormalized)
      .then(setRival)
      .catch(() => {});
  }, [data]);

  async function handleChangeBand(band: RivalStatus['difficultyBand']) {
    if (band === rival.difficultyBand || savingBand) return;
    const previous = rival.difficultyBand;
    setRival((r) => ({ ...r, difficultyBand: band }));
    setSavingBand(true);
    try {
      await updateDifficultyBand(band);
    } catch {
      setRival((r) => ({ ...r, difficultyBand: previous }));
    } finally {
      setSavingBand(false);
    }
  }

  if (!data) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </ScreenContainer>
    );
  }

  const gap = rival.yourSteps - rival.rivalSteps;
  const ahead = gap >= 0;
  const max = Math.max(rival.yourSteps, rival.rivalSteps, 1);

  return (
    <ScreenContainer>
      <Text style={styles.title}>Your Rival</Text>

      <Card style={styles.rivalHeader}>
        <Avatar name={rival.name} color={colors.rivalAccent} size={64} />
        <View style={styles.rivalInfo}>
          <Text style={styles.rivalName}>{rival.name}</Text>
          <View style={styles.bandPill}>
            <Text style={styles.bandText}>{rival.difficultyBand} pace</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.bars}>
        <RivalBar label="You" steps={rival.yourSteps} max={max} color={colors.secondary} />
        <RivalBar label={rival.name} steps={rival.rivalSteps} max={max} color={colors.rivalAccent} />
      </Card>

      <View style={[styles.statusBanner, { backgroundColor: ahead ? '#E3F6F3' : '#FDE6E1' }]}>
        <Text style={[styles.statusText, { color: ahead ? colors.secondaryDark : colors.danger }]}>
          {ahead
            ? `You're ${formatSteps(Math.abs(gap))} steps ahead — keep it up!`
            : `${rival.name} is ${formatSteps(Math.abs(gap))} steps ahead — close the gap!`}
        </Text>
      </View>

      <Card style={styles.bandCard}>
        <Text style={styles.bandCardTitle}>Rival difficulty</Text>
        <View style={styles.bandSelector}>
          {DIFFICULTY_BANDS.map((band) => {
            const active = band === rival.difficultyBand;
            return (
              <TouchableOpacity
                key={band}
                style={[styles.bandOption, active && styles.bandOptionActive]}
                onPress={() => handleChangeBand(band)}
                disabled={savingBand}
              >
                <Text style={[styles.bandOptionText, active && styles.bandOptionTextActive]}>{band}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <Text style={styles.footnote}>
        Your rival's pace is calibrated to your own recent activity, so the race stays fair. See PRD §13.3.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary, marginTop: spacing.sm },
  rivalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rivalInfo: { gap: spacing.xs },
  rivalName: { fontFamily: fontFamily.extraBold, fontSize: 22, color: colors.textPrimary },
  bandPill: { backgroundColor: '#EFEDFF', paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: radii.full, alignSelf: 'flex-start' },
  bandText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.rivalAccent, textTransform: 'capitalize' },
  bars: { gap: spacing.lg },
  statusBanner: { borderRadius: radii.md, padding: spacing.md },
  statusText: { fontFamily: fontFamily.extraBold, fontSize: 15, textAlign: 'center' },
  bandCard: { gap: spacing.sm },
  bandCardTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.textPrimary },
  bandSelector: { flexDirection: 'row', gap: spacing.xs },
  bandOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: '#EFEDFF',
  },
  bandOptionActive: { backgroundColor: colors.rivalAccent },
  bandOptionText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.rivalAccent, textTransform: 'capitalize' },
  bandOptionTextActive: { color: '#FFFFFF' },
  footnote: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
