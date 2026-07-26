import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { useAuth, signOut } from '@/lib/useAuth';
import { getMyProfile, updateLocation } from '@/lib/api/profile';
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
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSaved, setLocationSaved] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setCity(p?.city ?? '');
        setRegion(p?.region ?? '');
        setCountry(p?.country ?? '');
      })
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

  async function handleSaveLocation() {
    setLocationError(null);
    setLocationSaved(false);
    setSavingLocation(true);
    try {
      const updated = await updateLocation(city, region, country);
      setProfile(updated);
      setLocationSaved(true);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not save your location.');
    } finally {
      setSavingLocation(false);
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location</Text>
        <Card style={styles.locationCard}>
          <Text style={styles.hint}>
            Optional — used for city, national, and global leaderboards. Skip if you'd rather not share.
          </Text>

          <Text variant="label">CITY</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Austin"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          <Text variant="label" style={styles.fieldLabel}>REGION / STATE</Text>
          <TextInput
            value={region}
            onChangeText={setRegion}
            placeholder="e.g. Texas"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          <Text variant="label" style={styles.fieldLabel}>COUNTRY</Text>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="e.g. USA"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {locationError && <Text style={styles.locationError}>{locationError}</Text>}
          {locationSaved && !locationError && <Text style={styles.locationSaved}>Saved.</Text>}

          <PrimaryButton
            label="Save"
            onPress={handleSaveLocation}
            loading={savingLocation}
            style={styles.saveButton}
          />
        </Card>
      </View>

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
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  locationCard: { gap: spacing.xs },
  hint: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  fieldLabel: { marginTop: spacing.sm },
  input: {
    height: 48,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  locationError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  locationSaved: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  saveButton: { marginTop: spacing.sm },
  signOutButton: { backgroundColor: colors.danger, marginTop: spacing.md },
});
