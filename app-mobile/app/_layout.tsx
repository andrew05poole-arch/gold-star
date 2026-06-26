import { useCallback, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { OnboardingContext } from '@/lib/useOnboardingStatus';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const [hasOnboarded, setHasOnboarded] = useState(false);
  const completeOnboarding = useCallback(() => setHasOnboarded(true), []);
  const onboardingValue = useMemo(
    () => ({ hasOnboarded, completeOnboarding }),
    [hasOnboarded, completeOnboarding],
  );

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <OnboardingContext.Provider value={onboardingValue}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </OnboardingContext.Provider>
    </SafeAreaProvider>
  );
}
