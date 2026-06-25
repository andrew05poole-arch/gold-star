/**
 * Tracks whether the user has completed onboarding.
 * In-memory for the scaffold (resets on app reload) — swap the getter/setter
 * for AsyncStorage to persist across launches.
 */
import { createContext, useContext } from 'react';

export interface OnboardingState {
  hasOnboarded: boolean;
  completeOnboarding: () => void;
}

export const OnboardingContext = createContext<OnboardingState>({
  hasOnboarded: false,
  completeOnboarding: () => {},
});

export function useOnboardingStatus(): OnboardingState {
  return useContext(OnboardingContext);
}
