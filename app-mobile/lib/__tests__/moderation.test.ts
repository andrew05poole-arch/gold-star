/**
 * `moderation.ts` owns the Supabase client boundary for report/block (#85), so
 * — like stepRecords.test.ts — this mocks `@/lib/supabase` to exercise the real
 * wrapper implementations and assert the exact RPC args reach the backend.
 */
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

import { blockUser, isUserBlocked, reportUser, unblockUser } from '../api/moderation';
import { supabase } from '@/lib/supabase';

const mockGetUser = supabase.auth.getUser as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

describe('blockUser / unblockUser', () => {
  it('calls block_user with the target id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await blockUser('u2');
    expect(mockRpc).toHaveBeenCalledWith('block_user', { p_blocked_id: 'u2' });
  });

  it('calls unblock_user with the target id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await unblockUser('u2');
    expect(mockRpc).toHaveBeenCalledWith('unblock_user', { p_blocked_id: 'u2' });
  });

  it('throws when the RPC errors', async () => {
    mockRpc.mockResolvedValue({ error: new Error('boom') });
    await expect(blockUser('u2')).rejects.toThrow('boom');
  });
});

describe('reportUser', () => {
  it("defaults reason to 'other' and context to null", async () => {
    mockRpc.mockResolvedValue({ error: null });
    await reportUser('u2');
    expect(mockRpc).toHaveBeenCalledWith('report_user', { p_reported_id: 'u2', p_reason: 'other', p_context: null });
  });

  it('passes through an explicit reason and context', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await reportUser('u2', 'spam', 'posting junk');
    expect(mockRpc).toHaveBeenCalledWith('report_user', { p_reported_id: 'u2', p_reason: 'spam', p_context: 'posting junk' });
  });
});

describe('isUserBlocked', () => {
  function mockBlockRowQuery(row: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq2 = jest.fn().mockReturnValue({ maybeSingle });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const select = jest.fn().mockReturnValue({ eq: eq1 });
    mockFrom.mockReturnValue({ select });
  }

  it('returns true when a block row exists for the caller', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockBlockRowQuery({ blocked_id: 'u2' });
    await expect(isUserBlocked('u2')).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('user_blocks');
  });

  it('returns false when no block row exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockBlockRowQuery(null);
    await expect(isUserBlocked('u2')).resolves.toBe(false);
  });

  it('returns false (without querying) when not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(isUserBlocked('u2')).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
