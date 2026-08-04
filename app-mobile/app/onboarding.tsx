import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, radii, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { useAuth } from '@/lib/useAuth';
import { createMyProfile, updateDailyGoal } from '@/lib/api/profile';
import { addFriendByReferralCode } from '@/lib/api/leaderboard';
import { importHistoricalSteps } from '@/lib/historicalStepImport';
import { track } from '@/lib/analytics';
import { showAlert } from '@/lib/alert';
import type { HistoricalImportResult, ImportRangeDays } from '@/lib/types';
import { Text } from '@/components/Text';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';

type Step = 'intro' | 'height' | 'import' | 'results';
type ImportPhase = 'idle' | 'importing';

const IMPORT_RANGE_OPTIONS: ImportRangeDays[] = [7, 30, 90];
const DEFAULT_IMPORT_RANGE: ImportRangeDays = 30;

export default function Onboarding() {
  const router = useRouter();
  const { requestPermission } = useStepData();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingGrant, setPendingGrant] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [rangeDays, setRangeDays] = useState<ImportRangeDays>(DEFAULT_IMPORT_RANGE);
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResult, setImportResult] = useState<HistoricalImportResult | null>(null);

  function navigateHome() {
    router.replace('/(tabs)/home');
  }

  async function createProfileAndFriend(heightValue?: number) {
    const fallbackName = session?.user.email?.split('@')[0] ?? 'Player';
    await createMyProfile(fallbackName, heightValue);
    const code = inviteCode.trim();
    if (code) {
      // Best-effort: an invalid/unknown code shouldn't block onboarding.
      await addFriendByReferralCode(code).catch(() => {});
    }
  }

  function parseHeight(value: string): number | undefined {
    const parsed = Number(value);
    return value.trim().length > 0 && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  /**
   * Runs after the height step regardless of which button was pressed there.
   * The profile row must exist before any step_records write (historical
   * import included — step_records.user_id has an FK to profiles), so
   * profile creation always happens first.
   */
  async function proceedAfterHeight(heightValue?: number) {
    await createProfileAndFriend(heightValue);

    if (!pendingGrant) {
      track('onboarding_health_skipped', {});
      navigateHome();
      return;
    }

    track('health_permission_prompt_viewed', { platform: Platform.OS });
    // Resolves via mockStepProvider ('granted') by default, or the real
    // HealthKit/Health Connect permission prompt when
    // USE_REAL_HEALTH_PROVIDER is enabled — see lib/useStepData.ts.
    const status = await requestPermission();

    if (status === 'granted') {
      track('health_permission_granted', { platform: Platform.OS });
      setStep('import');
      return;
    }

    track('health_permission_denied', { platform: Platform.OS });
    showAlert(
      'Step access needed',
      'You can grant this later from your device Settings, or reconnect from your Profile. StepLeague still works without it.',
      [{ text: 'OK', onPress: navigateHome }],
    );
  }

  async function handleGrant() {
    setPendingGrant(true);
    setStep('height');
  }

  function handleSkipInvite() {
    setPendingGrant(false);
    setStep('height');
  }

  async function handleContinueFromHeight() {
    setLoading(true);
    await proceedAfterHeight(parseHeight(heightCm));
    setLoading(false);
  }

  async function handleSkipHeight() {
    setLoading(true);
    await proceedAfterHeight(undefined);
    setLoading(false);
  }

  async function handleStartImport() {
    setImportPhase('importing');
    track('historical_import_period_selected', { range_days: rangeDays });
    track('historical_import_started', { range_days: rangeDays, platform: Platform.OS });

    const result = await importHistoricalSteps({ rangeDays, requestedAt: new Date() });
    setImportResult(result);
    setImportPhase('idle');

    const eventByStatus: Record<HistoricalImportResult['status'], string> = {
      completed: 'historical_import_completed',
      partial: 'historical_import_partial',
      'no-data': 'historical_import_no_data',
      failed: 'historical_import_failed',
      // Not actually returned by importHistoricalSteps — permission is
      // checked by this screen before ever calling it — kept in the union
      // for API completeness with the broader feature spec.
      'permission-denied': 'historical_import_failed',
    };
    track(eventByStatus[result.status], {
      range_days: rangeDays,
      days_imported: result.importedDays,
      status: result.status,
      has_week_comparison: result.summary?.weekOverWeekPercent != null,
      has_profile: !!result.summary?.movementProfile,
      has_suggested_goal: result.summary?.suggestedDailyGoal != null,
    });
    if (result.summary?.movementProfile) {
      track('movement_profile_generated', { profile: result.summary.movementProfile.key });
    }
    if (result.summary?.suggestedDailyGoal != null) {
      track('starter_goal_generated', {});
    }

    setStep('results');
  }

  function handleSkipImport() {
    navigateHome();
  }

  async function handleFinishResults() {
    setLoading(true);
    const goal = importResult?.summary?.suggestedDailyGoal;
    if (goal != null) {
      // Best-effort: a failed goal write shouldn't strand the user in onboarding.
      await updateDailyGoal(goal).catch(() => {});
    }
    setLoading(false);
    navigateHome();
  }

  if (step === 'import') {
    return (
      <ScreenContainer>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons name="footsteps" size={64} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Bring your recent movement in</Text>
        </View>

        {importPhase === 'importing' ? (
          <View style={styles.importingBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text variant="body" style={styles.importingText}>
              Importing your recent steps…
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.pitch}>
              Import your recent step history to see personal comparisons, establish your baseline, and get a
              starter goal. Imported history will not retroactively affect live competitions.
            </Text>
            <Card style={styles.periodCard}>
              <Text variant="label">IMPORT PERIOD</Text>
              <View style={styles.periodRow}>
                {IMPORT_RANGE_OPTIONS.map((days) => {
                  const active = rangeDays === days;
                  return (
                    <TouchableOpacity
                      key={days}
                      style={[styles.periodOption, active && styles.periodOptionActive]}
                      onPress={() => setRangeDays(days)}
                    >
                      <Text style={[styles.periodOptionText, active && styles.periodOptionTextActive]}>
                        {days} days{days === DEFAULT_IMPORT_RANGE ? '\nRecommended' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>
            <View style={styles.actions}>
              <PrimaryButton label="Import my history" onPress={handleStartImport} />
              <PrimaryButton label="Skip for now" variant="ghost" onPress={handleSkipImport} />
            </View>
          </>
        )}
      </ScreenContainer>
    );
  }

  if (step === 'results') {
    const summary = importResult?.summary;
    return (
      <ScreenContainer>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons name={summary ? 'stats-chart' : 'checkmark'} size={64} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{summary ? 'Your Movement Profile' : "You're all set"}</Text>
        </View>

        {!summary && (
          <Text style={styles.pitch}>
            {importResult?.status === 'no-data'
              ? 'No recent step history was found. StepLeague will begin tracking your progress from today.'
              : "We couldn't import your history right now — you can try again later from your Profile. This won't stop you from using StepLeague today."}
          </Text>
        )}

        {summary && (
          <View style={styles.resultsCards}>
            {importResult?.status === 'partial' && (
              <Text variant="caption" style={styles.partialNote}>
                Some days couldn't be imported — showing what we could load.
              </Text>
            )}
            {summary.movementProfile && (
              <Card>
                <Text variant="label">MOVEMENT PROFILE</Text>
                <Text variant="heading">{summary.movementProfile.displayName}</Text>
                <Text variant="body" style={styles.cardBody}>
                  {summary.movementProfile.explanation}
                </Text>
              </Card>
            )}
            {summary.averageDailySteps !== null && (
              <Card>
                <Text variant="label">AVERAGE DAILY STEPS</Text>
                <Text variant="title">{summary.averageDailySteps.toLocaleString()}</Text>
                <Text variant="caption">Over the last {summary.daysWithData} tracked days</Text>
              </Card>
            )}
            {summary.bestDay && (
              <Card>
                <Text variant="label">BEST DAY</Text>
                <Text variant="title">{summary.bestDay.steps.toLocaleString()}</Text>
                <Text variant="caption">{summary.bestDay.date}</Text>
              </Card>
            )}
            {summary.weekOverWeekPercent !== null && (
              <Card>
                <Text variant="label">THIS WEEK VS LAST WEEK</Text>
                <Text variant="title">
                  {summary.weekOverWeekPercent > 0 ? '+' : ''}
                  {summary.weekOverWeekPercent}%
                </Text>
              </Card>
            )}
            {summary.suggestedDailyGoal !== null && (
              <Card>
                <Text variant="label">SUGGESTED FIRST GOAL</Text>
                <Text variant="title">{summary.suggestedDailyGoal.toLocaleString()} steps/day</Text>
                <Text variant="caption">A friendly starting target — not medical advice, just a game target.</Text>
              </Card>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={handleFinishResults} loading={loading} />
        </View>
      </ScreenContainer>
    );
  }

  if (step === 'height') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons name="body" size={64} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>One quick thing</Text>
          <Text style={styles.tagline}>Help us keep scoring fair for everyone.</Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.pitch}>
            Your stride length affects how far your steps actually take you. Share your height (in cm) so we
            can normalize your steps against everyone else's — or skip and we'll use an average stride.
          </Text>
          <View style={styles.form}>
            <Text variant="label">HEIGHT (CM)</Text>
            <TextInput
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="e.g. 175"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Continue" onPress={handleContinueFromHeight} loading={loading} />
          <PrimaryButton label="Skip for now" variant="ghost" onPress={handleSkipHeight} disabled={loading} />
          <Text style={styles.privacy}>You can always add this later from your profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="flame" size={64} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>StepLeague</Text>
        <Text style={styles.tagline}>A daily game you play with your feet.</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.pitch}>
          Turn your steps into a daily game — build streaks, climb the leaderboard, and race your AI rival.
        </Text>
        <View style={styles.bullets}>
          <Bullet icon="footsteps" text="Track steps automatically" />
          <Bullet icon="flame" text="Keep your streak alive" />
          <Bullet icon="trophy" text="Beat friends & your rival" />
        </View>
      </View>

      <View style={styles.actions}>
        <Text style={styles.inviteLabel}>Got an invite code?</Text>
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Optional — e.g. AB3XQ9KP"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.inviteInput}
        />
        <PrimaryButton label="Connect my steps" onPress={handleGrant} />
        <PrimaryButton label="I'll invite friends later" variant="ghost" onPress={handleSkipInvite} />
        <Text style={styles.privacy}>
          StepLeague reads only your step count from Apple Health or Health Connect — never other health data — to power
          your streaks, challenges, and leaderboards. We never sell your data. You can delete your account and all your
          data anytime.
        </Text>
        <TouchableOpacity onPress={() => router.push('/privacy')}>
          <Text style={styles.privacyLink}>Read our privacy policy</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'space-between' },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontFamily: fontFamily.extraBold, fontSize: 36, color: colors.textPrimary, textAlign: 'center' },
  tagline: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.primary },
  body: { gap: spacing.lg },
  pitch: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bullets: { gap: spacing.md },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bulletIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: '#FFEDE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletText: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.textPrimary },
  form: { gap: spacing.sm },
  input: {
    height: 56,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  actions: { gap: spacing.sm },
  inviteLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textSecondary },
  inviteInput: {
    height: 48,
    width: '100%',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  privacy: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  privacyLink: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  importingBox: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  importingText: { color: colors.textSecondary },
  periodCard: { gap: spacing.sm },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  periodOption: {
    flex: 1,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  periodOptionActive: { backgroundColor: colors.rivalAccent, borderColor: colors.rivalAccent },
  periodOptionText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  periodOptionTextActive: { color: '#FFFFFF' },
  resultsCards: { gap: spacing.md },
  cardBody: { marginTop: spacing.xs },
  partialNote: { color: colors.danger, textAlign: 'center' },
});
