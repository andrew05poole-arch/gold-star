import React from 'react';
import { render } from '@testing-library/react-native';

// `expo-router`'s real <Redirect> performs actual navigation, which needs a
// full router context we don't want to stand up for this smoke test. Mock it
// so we can assert on the `href` the gate decided to redirect to instead.
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

import Index from '../index';
import { OnboardingContext } from '@/lib/useOnboardingStatus';

function renderIndex(hasOnboarded: boolean) {
  return render(
    <OnboardingContext.Provider value={{ hasOnboarded, completeOnboarding: () => {} }}>
      <Index />
    </OnboardingContext.Provider>,
  );
}

describe('app/index (auth/onboarding gate)', () => {
  it('redirects to onboarding when the user has not onboarded', async () => {
    const { getByTestId } = await renderIndex(false);
    expect(getByTestId('redirect').props.children).toBe('/onboarding');
  });

  it('redirects to the home tab when the user has onboarded', async () => {
    const { getByTestId } = await renderIndex(true);
    expect(getByTestId('redirect').props.children).toBe('/(tabs)/home');
  });
});
