import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

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

import Home from '../home';
import { useStepData } from '@/lib/useStepData';
import { getRivalStatus } from '@/lib/api/rival';
import { getMyStreak } from '@/lib/api/streaks';

const mockUseStepData = useStepData as jest.Mock;
const mockGetRivalStatus = getRivalStatus as jest.Mock;
const mockGetMyStreak = getMyStreak as jest.Mock;

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
