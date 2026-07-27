import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { useAuth, signOut } from '@/lib/useAuth';
import { getMyProfile } from '@/lib/api/profile';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { User } from '@/lib/types';

export default function Profile() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // app/index.tsx watches the session and redirects to /login once it clears.
    } catch (err) {
      setSigningOut(false);
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  const displayName = profile?.displayName ?? 'Runner';
  const email = session?.user?.email ?? '';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <Card style={styles.accountCard}>
        <Avatar name={displayName} color={profile?.avatarColor ?? colors.primary} size={64} />
        <View style={styles.accountInfo}>
          <Text style={styles.name}>{displayName}</Text>
          {!!email && <Text style={styles.email}>{email}</Text>}
        </View>
      </Card>

      <PrimaryButton
        label="Sign out"
        onPress={handleSignOut}
        loading={signingOut}
        style={styles.signOutButton}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  title: { fontFamily: fontFamily.extraBold, fontSize: 28, color: colors.textPrimary },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  accountInfo: { gap: spacing.xs },
  name: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  email: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textSecondary },
  signOutButton: { backgroundColor: colors.danger },
});
