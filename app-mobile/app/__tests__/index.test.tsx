import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// `expo-router`'s real <Redirect> performs actual navigation, which needs a
// full router context we don't want to stand up for this smoke test. Mock it
// so we can assert on the `href` the gate decided to redirect to instead.
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));

jest.mock('@/lib/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/api/profile', () => ({
  getMyProfile: jest.fn(),
}));

import Index from '../index';
import { useAuth } from '@/lib/useAuth';
import { getMyProfile } from '@/lib/api/profile';

const mockUseAuth = useAuth as jest.Mock;
const mockGetMyProfile = getMyProfile as jest.Mock;

describe('app/index (auth/profile gate)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to login when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null, loading: false });
    const { getByTestId } = await render(<Index />);
    await waitFor(() => expect(getByTestId('redirect').props.children).toBe('/login'));
  });

  it('redirects to onboarding when signed in with no profile yet', async () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
    mockGetMyProfile.mockResolvedValue(null);
    const { getByTestId } = await render(<Index />);
    await waitFor(() => expect(getByTestId('redirect').props.children).toBe('/onboarding'));
  });

  it('redirects to the home tab when signed in with a profile', async () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } }, loading: false });
    mockGetMyProfile.mockResolvedValue({ id: 'u1', displayName: 'A', avatarColor: '#fff', dailyGoal: 8000 });
    const { getByTestId } = await render(<Index />);
    await waitFor(() => expect(getByTestId('redirect').props.children).toBe('/(tabs)/home'));
  });
});
