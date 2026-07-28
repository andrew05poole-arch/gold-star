import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, fontSize, radii, spacing } from '@/lib/theme';
import { signInWithOtp, verifyOtp } from '@/lib/useAuth';
import { errorMessage } from '@/lib/errorMessage';
import { Text } from '@/components/Text';
import { ScreenContainer } from '@/components/ScreenContainer';
import { PrimaryButton } from '@/components/PrimaryButton';

type Step = 'email' | 'code';

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    setError(null);
    setLoading(true);
    try {
      await signInWithOtp(email.trim());
      setStep('code');
    } catch (e) {
      setError(errorMessage(e, 'Could not send code. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(email.trim(), code.trim());
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e, 'Invalid or expired code.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="flame" size={48} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>StepLeague</Text>
      </View>

      {step === 'email' ? (
        <View style={styles.form}>
          <Text variant="label">EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton
            label="Send me a code"
            onPress={handleSendCode}
            loading={loading}
            disabled={!email.includes('@')}
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text variant="label">CODE SENT TO {email}</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton label="Verify & continue" onPress={handleVerify} loading={loading} disabled={code.length < 6} />
          <PrimaryButton label="Use a different email" variant="ghost" onPress={() => setStep('email')} />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xl },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.extraBold, fontSize: 32, color: colors.textPrimary },
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
    marginBottom: spacing.sm,
  },
  error: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.xs },
});
