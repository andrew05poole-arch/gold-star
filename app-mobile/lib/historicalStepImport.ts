/**
 * Domain-level service: onboarding historical step import. Orchestrates
 * permission -> historical query -> normalization/validation -> persistence
 * -> summary, and returns a user-safe result — no UI/native-provider code
 * here (see app/onboarding.tsx for the screen, lib/healthStepProvider.ts /
 * lib/useStepData.ts for the provider layer).
 *
 * Permission is NOT this service's concern: callers must already have a
 * granted permission before calling `importHistoricalSteps` (see
 * app/onboarding.tsx, which checks `requestPermission()`'s result itself
 * and never calls this service when denied) — that keeps 'permission-denied'
 * as a caller-level concept, not something this service re-derives.
 */
import { Platform } from 'react-native';
import { activeProvider, USE_REAL_HEALTH_PROVIDER } from './useStepData';
import { upsertHistoricalStepRecords } from './api/stepRecords';
import { calculateHistoricalStepSummary } from './stepHistorySummary';
import { addLocalDays, localDateKey, startOfLocalDay } from './dateRange';
import type { HistoricalImportResult, HistoricalImportStatus, ImportRangeDays, StepDay, StepSource } from './types';

export interface HistoricalStepImportInput {
  rangeDays: ImportRangeDays;
  requestedAt: Date;
}

/** Same platform check healthStepProvider.ts uses for its own fallback `source` — duplicated (not imported) so this service never statically imports that native-module-gated file. */
function resolveSource(): StepSource {
  if (!USE_REAL_HEALTH_PROVIDER) return 'mock';
  return Platform.OS === 'ios' ? 'healthkit' : 'googlefit';
}

function resultShell(status: HistoricalImportStatus, periodStart: string, periodEnd: string, skippedDays = 0): HistoricalImportResult {
  return { status, importedDays: 0, updatedDays: 0, skippedDays, startDate: periodStart, endDate: periodEnd };
}

export async function importHistoricalSteps(input: HistoricalStepImportInput): Promise<HistoricalImportResult> {
  const { rangeDays, requestedAt } = input;

  // "Historical" always means strictly-before-today — see
  // lib/api/stepRecords.ts's upsertHistoricalStepRecords doc comment for why
  // today must stay on the live sensor write-through path
  // (useStepData.ts's upsertTodayStepRecord) instead of this bulk one.
  const endDate = addLocalDays(startOfLocalDay(requestedAt), -1);
  const startDate = addLocalDays(endDate, -(rangeDays - 1));
  const periodStart = localDateKey(startDate);
  const periodEnd = localDateKey(endDate);

  let fetched: StepDay[];
  try {
    fetched = await activeProvider.getHistoricalDailySteps({ startDate, endDate });
  } catch {
    // Provider threw outright (shouldn't normally happen — both providers
    // fail-closed to an empty array internally — but never let a provider
    // bug block onboarding).
    return resultShell('failed', periodStart, periodEnd);
  }

  if (fetched.length === 0) {
    return resultShell('no-data', periodStart, periodEnd);
  }

  // Validate + dedupe at the boundary — never trust an external data source
  // (the native HealthKit/Health Connect bridge, or a future third
  // provider) even though today's providers shouldn't ever produce
  // duplicate dates or negative values themselves.
  const seenDates = new Set<string>();
  const valid: StepDay[] = [];
  let skippedDays = 0;
  for (const record of fetched) {
    const isDuplicate = seenDates.has(record.date);
    const isInvalid = !Number.isFinite(record.rawSteps) || record.rawSteps < 0;
    if (isDuplicate || isInvalid) {
      skippedDays += 1;
      continue;
    }
    seenDates.add(record.date);
    valid.push(record);
  }

  if (valid.length === 0) {
    return resultShell('no-data', periodStart, periodEnd, skippedDays);
  }

  const source = resolveSource();
  let persisted: { importedDays: number; updatedDays: number };
  try {
    persisted = await upsertHistoricalStepRecords(valid.map((r) => ({ date: r.date, rawSteps: r.rawSteps, source })));
  } catch {
    // Persistence failed after a successful fetch. The fetched data isn't
    // durably saved, but the import can simply be retried — the upsert is
    // idempotent (keyed on the DB's `unique(user_id, date)` constraint), so
    // retrying never creates duplicates or double-counts. Report 'failed'
    // rather than a misleading 'completed'/'partial'.
    return resultShell('failed', periodStart, periodEnd, skippedDays);
  }

  const summary = calculateHistoricalStepSummary({ records: valid, periodStart, periodEnd, now: requestedAt });

  return {
    status: skippedDays > 0 ? 'partial' : 'completed',
    importedDays: persisted.importedDays,
    updatedDays: persisted.updatedDays,
    skippedDays,
    startDate: periodStart,
    endDate: periodEnd,
    summary,
  };
}
