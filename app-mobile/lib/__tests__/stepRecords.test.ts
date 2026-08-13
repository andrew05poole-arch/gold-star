/**
 * `stepRecords.ts` is the module that owns the Supabase client boundary for
 * step writes, so — unlike `historicalStepImport.test.ts`, which mocks this
 * module wholesale from the outside — this file has to mock `@/lib/supabase`
 * itself to exercise the real `upsertTodayStepRecord` implementation.
 */
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { upsertTodayStepRecord } from '../api/stepRecords';
import { localDateKey } from '../dateRange';
import { supabase } from '@/lib/supabase';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

describe('upsertTodayStepRecord', () => {
  it('keys the live write on the device LOCAL calendar day, not the UTC day (#75)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const mockUpsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    // Regression guard for #75: this must be `localDateKey(new Date())`, not
    // `new Date().toISOString().slice(0, 10)` — the latter would attribute a
    // step taken near local midnight to the wrong calendar day depending on
    // the device's timezone offset. Asserting against `localDateKey` itself
    // (rather than a hardcoded date string) keeps this test timezone-robust.
    await upsertTodayStepRecord(1234, 'mock');

    expect(mockFrom).toHaveBeenCalledWith('step_records');
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', date: localDateKey(new Date()), raw_steps: 1234, source: 'mock' },
      { onConflict: 'user_id,date' },
    );
  });

  it('does nothing when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await upsertTodayStepRecord(1234, 'mock');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when the upsert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const mockUpsert = jest.fn().mockResolvedValue({ error: new Error('boom') });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    await expect(upsertTodayStepRecord(1234, 'mock')).rejects.toThrow('boom');
  });
});
