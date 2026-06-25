import { Redirect } from 'expo-router';
import { useOnboardingStatus } from '@/lib/useOnboardingStatus';

/** Entry gate: route to onboarding or the main tabs. */
export default function Index() {
  const { hasOnboarded } = useOnboardingStatus();
  return <Redirect href={hasOnboarded ? '/(tabs)/home' : '/onboarding'} />;
}
