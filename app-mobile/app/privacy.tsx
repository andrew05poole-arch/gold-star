import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';

/**
 * In-app privacy / health-data disclosure. StepLeague has no hosted domain
 * yet, so this screen IS the privacy policy — reachable from onboarding
 * (before the health-permission prompt) and from Profile. Plain-language
 * product copy, deliberately not written as a formal legal document or under
 * any impersonated legal entity; it describes what the app actually does.
 */
export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading">Privacy</Text>
        <View style={styles.backBtn} />
      </View>

      <Card style={styles.card}>
        <Text variant="heading">What we collect</Text>
        <Text variant="body" style={styles.body}>
          Your daily step count, read from Apple Health (HealthKit) on iOS or Health Connect on Android with your
          permission. We only read step counts — never other health data. We also store the profile details you choose to
          enter: your display name, optional photo, bio, and location (city/region/country).
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">How we use it</Text>
        <Text variant="body" style={styles.body}>
          Your steps power your daily goal progress, streaks, challenges, and leaderboards. Depending on the settings you
          choose, some of this is visible to your friends or, for public leaderboards, to other StepLeague users. Your
          location, if you provide it, is only used to place you on city, national, and global leaderboards.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Where it's stored, and who sees it</Text>
        <Text variant="body" style={styles.body}>
          Your data is stored in StepLeague's secure backend (Supabase). We never sell your data, and we never share your
          health data with third parties or advertisers. Access to other users' data is limited by per-row security rules
          — for example, an invite-only challenge is visible only to its participants and invitees.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">Your control</Text>
        <Text variant="body" style={styles.body}>
          You can revoke step-tracking access at any time in your device's Health settings — StepLeague still works
          without it, just without automatic step syncing. You can delete your account at any time from the Profile tab;
          deleting your account permanently removes all of your data, including your step history.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  card: { gap: spacing.sm },
  body: { fontFamily: fontFamily.semibold, lineHeight: 21 },
});
