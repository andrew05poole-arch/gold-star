import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { useStepData } from '@/lib/useStepData';
import { useAuth } from '@/lib/useAuth';
import { createMyProfile } from '@/lib/api/profile';
import { Text } from '@/components/Text';
import { PrimaryButton } from '@/components/PrimaryButton';

export default function Onboarding() {
  const router = useRouter();
  const { requestPermission } = useStepData();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  async function finishOnboarding() {
    const fallbackName = session?.user.email?.split('@')[0] ?? 'Player';
    await createMyProfile(fallbackName);
    router.replace('/(tabs)/home');
  }

  async function handleGrant() {
    setLoading(true);
    await requestPermission(); // stubbed -> 'granted'
    await finishOnboarding();
    setLoading(false);
  }

  async function handleSkipInvite() {
    setLoading(true);
    await finishOnboarding();
    setLoading(false);
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
        <PrimaryButton label="Connect my steps" onPress={handleGrant} loading={loading} />
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
  actions: { gap: spacing.sm },
  privacy: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
});
