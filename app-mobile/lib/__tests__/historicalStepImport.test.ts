/**
 * Mocks at the same module boundaries `importHistoricalSteps` itself
 * imports from (`@/lib/useStepData`'s `activeProvider`/`USE_REAL_HEALTH_PROVIDER`,
 * `@/lib/api/stepRecords`'s `upsertHistoricalStepRecords`) — the established
 * convention in this repo (see app/__tests__/index.test.tsx) is to mock the
 * `lib/api/*.ts` helper boundary rather than the raw Supabase client;
 * extended here to the provider boundary too, for the same reason (no
 * lower-level Supabase-client mock precedent exists in this repo to build
 * on instead).
 */
jest.mock('@/lib/useStepData', () => ({
  activeProvider: { getHistoricalDailySteps: jest.fn() },
  USE_REAL_HEALTH_PROVIDER: false,
}));
jest.mock('@/lib/api/stepRecords', () => ({
  upsertHistoricalStepRecords: jest.fn(),
}));

import { importHistoricalSteps } from '../historicalStepImport';
import { activeProvider } from '@/lib/useStepData';
import { upsertHistoricalStepRecords } from '@/lib/api/stepRecords';
import { localDateKey } from '@/lib/dateRange';

const mockGetHistorical = activeProvider.getHistoricalDailySteps as jest.Mock;
const mockUpsert = upsertHistoricalStepRecords as jest.Mock;

afterEach(() => {
  jest.clearAllMocks();
});

const REQUESTED_AT = new Date(2026, 6, 27);

describe('importHistoricalSteps', () => {
  it('returns no-data when the provider has nothing, without ever calling persistence', async () => {
    mockGetHistorical.mockResolvedValue([]);
    const result = await importHistoricalSteps({ rangeDays: 30, requestedAt: REQUESTED_AT });
    expect(result.status).toBe('no-data');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('never includes today in the requested range — today stays on the live sensor write-through path', async () => {
    mockGetHistorical.mockResolvedValue([{ date: '2026-07-26', rawSteps: 5000, normalizedSteps: 5000 }]);
    mockUpsert.mockResolvedValue({ importedDays: 1, updatedDays: 0 });
    await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });
    const queryArg = mockGetHistorical.mock.calls[0][0];
    expect(localDateKey(queryArg.endDate)).toBe('2026-07-26');
  });

  it('dedupes duplicate dates and skips invalid records, reporting a partial status', async () => {
    mockGetHistorical.mockResolvedValue([
      { date: '2026-07-26', rawSteps: 5000, normalizedSteps: 5000 },
      { date: '2026-07-26', rawSteps: 6000, normalizedSteps: 6000 }, // duplicate date
      { date: '2026-07-25', rawSteps: -10, normalizedSteps: -10 }, // invalid: negative
    ]);
    mockUpsert.mockResolvedValue({ importedDays: 1, updatedDays: 0 });

    const result = await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });

    expect(result.status).toBe('partial');
    expect(result.skippedDays).toBe(2);
    expect(mockUpsert).toHaveBeenCalledWith([{ date: '2026-07-26', rawSteps: 5000, source: 'mock' }]);
  });

  it('is idempotent on re-import: importedDays/updatedDays come straight from the persistence layer', async () => {
    mockGetHistorical.mockResolvedValue([{ date: '2026-07-26', rawSteps: 5000, normalizedSteps: 5000 }]);
    mockUpsert.mockResolvedValue({ importedDays: 0, updatedDays: 1 }); // already existed — a re-import
    const result = await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });
    expect(result.status).toBe('completed');
    expect(result.importedDays).toBe(0);
    expect(result.updatedDays).toBe(1);
  });

  it('reports failed (not completed) when persistence throws after a successful fetch', async () => {
    mockGetHistorical.mockResolvedValue([{ date: '2026-07-26', rawSteps: 5000, normalizedSteps: 5000 }]);
    mockUpsert.mockRejectedValue(new Error('network down'));
    const result = await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });
    expect(result.status).toBe('failed');
  });

  it('reports failed when the provider itself throws', async () => {
    mockGetHistorical.mockRejectedValue(new Error('native module not linked'));
    const result = await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });
    expect(result.status).toBe('failed');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns completed with a summary when everything succeeds', async () => {
    mockGetHistorical.mockResolvedValue([
      { date: '2026-07-26', rawSteps: 8000, normalizedSteps: 8000 },
      { date: '2026-07-25', rawSteps: 9000, normalizedSteps: 9000 },
      { date: '2026-07-24', rawSteps: 7000, normalizedSteps: 7000 },
    ]);
    mockUpsert.mockResolvedValue({ importedDays: 3, updatedDays: 0 });

    const result = await importHistoricalSteps({ rangeDays: 7, requestedAt: REQUESTED_AT });

    expect(result.status).toBe('completed');
    expect(result.summary?.daysWithData).toBe(3);
    expect(result.summary?.totalSteps).toBe(24000);
  });
});
