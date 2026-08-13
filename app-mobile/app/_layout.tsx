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
import { AuthContext, useProvideAuth } from '@/lib/useAuth';
import { colors } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const auth = useProvideAuth();

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthContext.Provider value={auth}>
        <StatusBar style="dark" />
        <ErrorBoundary>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="challenge/[id]" />
            <Stack.Screen name="profile/[userId]" />
            <Stack.Screen name="privacy" />
          </Stack>
        </ErrorBoundary>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}
