/**
 * `profile.ts` owns the Supabase client boundary for profile writes, so —
 * same as stepRecords.test.ts — this file mocks `@/lib/supabase` itself to
 * exercise the real `updateDisplayName` implementation (#77).
 */
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { updateDisplayName } from '../api/profile';
import { supabase } from '@/lib/supabase';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function mockProfileUpdateChain(result: { data: unknown; error: unknown }) {
  const mockSingle = jest.fn().mockResolvedValue(result);
  const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
  const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ update: mockUpdate });
  return { mockUpdate, mockEq };
}

const profileRow = {
  id: 'u1',
  display_name: 'Alex',
  avatar_color: '#000000',
  avatar_url: null,
  bio: null,
  daily_goal: 10000,
  height_cm: null,
  stride_length_cm: null,
  referral_code: 'ABC123',
  city: null,
  region: null,
  country: null,
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('updateDisplayName', () => {
  it('writes the trimmed display_name to profiles and returns the updated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const { mockUpdate, mockEq } = mockProfileUpdateChain({ data: profileRow, error: null });

    const result = await updateDisplayName('  Alex  ');

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Alex' });
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
    expect(result.displayName).toBe('Alex');
  });

  it('throws and never touches the table when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(updateDisplayName('Alex')).rejects.toThrow('Not signed in');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('propagates a supabase error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockProfileUpdateChain({ data: null, error: new Error('boom') });

    await expect(updateDisplayName('Alex')).rejects.toThrow('boom');
  });
});
