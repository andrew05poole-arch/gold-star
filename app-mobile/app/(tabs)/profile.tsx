import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { useAuth, signOut } from '@/lib/useAuth';
import { getMyProfile, updateBio, updateLocation, uploadAvatar } from '@/lib/api/profile';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { User } from '@/lib/types';

const BIO_MAX_LENGTH = 160;

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
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioSaved, setBioSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setProfile(p);
        setCity(p?.city ?? '');
        setRegion(p?.region ?? '');
        setCountry(p?.country ?? '');
        setBio(p?.bio ?? '');
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

  async function handleSaveBio() {
    setBioError(null);
    setBioSaved(false);
    setSavingBio(true);
    try {
      const updated = await updateBio(bio);
      setProfile(updated);
      setBioSaved(true);
    } catch (err) {
      setBioError(err instanceof Error ? err.message : 'Could not save your bio.');
    } finally {
      setSavingBio(false);
    }
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Enable photo access from Settings to set a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const avatarUrl = await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
      setProfile((prev) => (prev ? { ...prev, avatarUrl } : prev));
    } catch (err) {
      Alert.alert('Could not upload photo', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploadingPhoto(false);
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
        <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto} style={styles.avatarWrap}>
          <Avatar name={displayName} color={profile?.avatarColor ?? colors.primary} photoUrl={profile?.avatarUrl} size={64} />
          <View style={styles.avatarBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            )}
          </View>
        </Pressable>
        <View style={styles.accountInfo}>
          <Text style={styles.name}>{displayName}</Text>
          {!!email && <Text style={styles.email}>{email}</Text>}
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Card style={styles.aboutCard}>
          <Text style={styles.hint}>Optional — a short line others see on your public profile.</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="e.g. Chasing a 30-day streak."
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, styles.bioInput]}
            multiline
            maxLength={BIO_MAX_LENGTH}
          />
          <Text variant="caption" style={styles.bioCount}>
            {bio.length}/{BIO_MAX_LENGTH}
          </Text>

          {bioError && <Text style={styles.locationError}>{bioError}</Text>}
          {bioSaved && !bioError && <Text style={styles.locationSaved}>Saved.</Text>}

          <PrimaryButton label="Save" onPress={handleSaveBio} loading={savingBio} style={styles.saveButton} />
        </Card>
      </View>

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
  avatarWrap: { position: 'relative' },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { gap: spacing.xs },
  name: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  email: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textSecondary },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { fontFamily: fontFamily.extraBold, fontSize: 18, color: colors.textPrimary },
  aboutCard: { gap: spacing.xs },
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
  bioInput: { height: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  bioCount: { textAlign: 'right' },
  locationError: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  locationSaved: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  saveButton: { marginTop: spacing.sm },
  signOutButton: { backgroundColor: colors.danger, marginTop: spacing.md },
});
