import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

/**
 * Mocked at the same `lib/*` boundaries Home itself imports from — the
 * established convention in this repo (see app/__tests__/index.test.tsx,
 * lib/__tests__/historicalStepImport.test.ts) is to mock the `lib`
 * hook/api boundary rather than lower-level modules like Supabase.
 */
jest.mock('@/lib/useStepData', () => ({
  useStepData: jest.fn(),
}));
jest.mock('@/lib/api/rival', () => ({
  getRivalStatus: jest.fn(),
}));
jest.mock('@/lib/api/streaks', () => ({
  getMyStreak: jest.fn(),
}));
jest.mock('@/lib/api/challenges', () => ({
  getChallenges: jest.fn(),
}));
// Home now navigates to a challenge's detail screen on tap — mock the
// router hook rather than standing up a real navigation context, same as
// app/__tests__/index.test.tsx does for expo-router's <Redirect>.
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

import Home from '../home';
import { useStepData } from '@/lib/useStepData';
import { getRivalStatus } from '@/lib/api/rival';
import { getMyStreak } from '@/lib/api/streaks';
import { getChallenges } from '@/lib/api/challenges';
import { useRouter } from 'expo-router';

const mockUseStepData = useStepData as jest.Mock;
const mockGetRivalStatus = getRivalStatus as jest.Mock;
const mockGetMyStreak = getMyStreak as jest.Mock;
const mockGetChallenges = getChallenges as jest.Mock;
const mockUseRouter = useRouter as jest.Mock;

// The mock step provider's fabricated `streakDays` (see lib/useStepData.ts's
// `mockStepProvider.getSnapshot`) — this must never be what the flame shows
// when the real `getMyStreak()` fetch fails.
const FABRICATED_MOCK_STREAK = 6;

const snapshot = {
  todaySteps: 4200,
  dailyGoal: 10_000,
  streakDays: FABRICATED_MOCK_STREAK,
  source: 'mock' as const,
  weeklyHistory: [{ date: '2026-08-13', rawSteps: 4200, normalizedSteps: 4200 }],
};

describe('Home streak fetch error handling', () => {
  beforeEach(() => {
    mockUseStepData.mockReturnValue({ data: snapshot, isLoading: false });
    mockGetRivalStatus.mockResolvedValue({ name: 'Echo', difficultyBand: 'even', yourSteps: 1, rivalSteps: 1 });
    mockGetChallenges.mockResolvedValue([]);
    mockUseRouter.mockReturnValue({ push: jest.fn() });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not fall back to the fabricated mock streak when getMyStreak() rejects, and surfaces the error', async () => {
    mockGetMyStreak.mockRejectedValue(new Error('network down'));

    const { queryByText, findByText } = await render(<Home />);

    await findByText("network down");
    // The fabricated mock streak value must never appear on screen.
    expect(queryByText(String(FABRICATED_MOCK_STREAK))).toBeNull();
    // A neutral placeholder is shown instead of any streak number.
    expect(queryByText('—')).not.toBeNull();
  });

  it('renders the real streak once getMyStreak() resolves, with no error text', async () => {
    mockGetMyStreak.mockResolvedValue({ currentLength: 12, longestLength: 12, freezesRemaining: 2 });

    const { queryByText, findByText } = await render(<Home />);

    await findByText('12');
    expect(queryByText(String(FABRICATED_MOCK_STREAK))).toBeNull();
    await waitFor(() => expect(queryByText('—')).toBeNull());
  });
});

describe('Home active-challenge card', () => {
  beforeEach(() => {
    mockUseStepData.mockReturnValue({ data: snapshot, isLoading: false });
    mockGetRivalStatus.mockResolvedValue({ name: 'Echo', difficultyBand: 'even', yourSteps: 1, rivalSteps: 1 });
    mockGetMyStreak.mockResolvedValue({ currentLength: 12, longestLength: 12, freezesRemaining: 2 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows a subtle "No active challenge" note when nothing is active', async () => {
    mockGetChallenges.mockResolvedValue([
      { id: 'j1', title: 'Joinable', subtitle: '', variant: 'joinable', progress: 0, participants: 3, startsAt: '2026-08-01', visibility: 'public' },
    ]);
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const { findByText, queryByText } = await render(<Home />);

    await findByText('No active challenge');
    expect(queryByText('ACTIVE CHALLENGE')).toBeNull();
  });

  it('renders the highest-progress active challenge and navigates to its detail screen on tap', async () => {
    mockGetChallenges.mockResolvedValue([
      {
        id: 'low',
        title: 'Low progress challenge',
        subtitle: '',
        variant: 'active',
        status: 'active',
        progress: 0.2,
        participants: 4,
        startsAt: '2026-08-01',
        visibility: 'public',
      },
      {
        id: 'high',
        title: 'Step it up',
        subtitle: '',
        variant: 'active',
        status: 'active',
        progress: 0.75,
        participants: 5,
        startsAt: '2026-08-05',
        visibility: 'public',
      },
    ]);
    const push = jest.fn();
    mockUseRouter.mockReturnValue({ push });

    const { findByText, queryByText } = await render(<Home />);

    await findByText('Step it up');
    expect(queryByText('75%')).not.toBeNull();
    expect(queryByText('+1 more active')).not.toBeNull();
    expect(queryByText('Low progress challenge')).toBeNull();

    fireEvent.press(await findByText('Step it up'));
    expect(push).toHaveBeenCalledWith({ pathname: '/challenge/[id]', params: { id: 'high' } });
  });

  it('surfaces a load error via errorMessage() without crashing', async () => {
    mockGetChallenges.mockRejectedValue(new Error('challenges down'));
    mockUseRouter.mockReturnValue({ push: jest.fn() });

    const { findByText } = await render(<Home />);

    await findByText('challenges down');
  });
});
