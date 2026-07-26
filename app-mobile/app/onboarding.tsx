import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, radii, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { useAuth } from '@/lib/useAuth';
import { createMyProfile } from '@/lib/api/profile';
import { Text } from '@/components/Text';
import { PrimaryButton } from '@/components/PrimaryButton';

type Step = 'intro' | 'height';

export default function Onboarding() {
  const router = useRouter();
  const { requestPermission } = useStepData();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [heightCm, setHeightCm] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingGrant, setPendingGrant] = useState(false);

  async function finishOnboarding(heightValue?: number) {
    const fallbackName = session?.user.email?.split('@')[0] ?? 'Player';
    await createMyProfile(fallbackName, heightValue);
    router.replace('/(tabs)/home');
  }

  function handleGrant() {
    setPendingGrant(true);
    setStep('height');
  }

  function handleSkipInvite() {
    setPendingGrant(false);
    setStep('height');
  }

  async function handleContinueFromHeight() {
    setLoading(true);
    const parsed = Number(heightCm);
    const heightValue = heightCm.trim().length > 0 && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    if (pendingGrant) {
      await requestPermission(); // stubbed -> 'granted'
    }
    await finishOnboarding(heightValue);
    setLoading(false);
  }

  async function handleSkipHeight() {
    setLoading(true);
    if (pendingGrant) {
      await requestPermission(); // stubbed -> 'granted'
    }
    await finishOnboarding(undefined);
    setLoading(false);
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
        <PrimaryButton label="Connect my steps" onPress={handleGrant} />
        <PrimaryButton label="I'll invite friends later" variant="ghost" onPress={handleSkipInvite} />
        <Text style={styles.privacy}>We only read step counts. You're always in control.</Text>
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
  title: { fontFamily: fontFamily.extraBold, fontSize: 36, color: colors.textPrimary },
  tagline: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.primary },
  body: { gap: spacing.lg },
  pitch: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.textPrimary, textAlign: 'center', lineHeight: 24 },
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
  privacy: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
});
