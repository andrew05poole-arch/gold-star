/**
 * Real `StepDataProvider` backed by platform Health APIs.
 *
 * - iOS: Apple HealthKit via `react-native-health`.
 * - Android: Health Connect via `react-native-health-connect`.
 *
 * This is implemented against each library's documented JS API, but the
 * native modules it wraps only exist in a custom EAS dev client build — they
 * are NOT present in Expo Go and cannot be exercised in this headless/CI
 * sandbox (no device, no native build tooling). See `useStepData.ts` for the
 * `USE_REAL_HEALTH_PROVIDER` flag that keeps this behind an opt-in until a
 * human verifies it on a real device/dev-client build.
 *
 * Manual verification steps for a human with a device + dev client:
 *   1. Build a dev client: `eas build --profile development --platform ios`
 *      (and/or `--platform android`).
 *   2. Set `USE_REAL_HEALTH_PROVIDER=true` (see useStepData.ts) and run the
 *      app in that dev client (not Expo Go).
 *   3. iOS: confirm the system HealthKit permission sheet appears on
 *      `requestPermission()`, listing "Steps" as a read item; grant it, then
 *      confirm `getSnapshot()` returns today's real step count and that it
 *      matches the Health app.
 *   4. Android: confirm the Health Connect permission screen appears (Health
 *      Connect must be installed — Play Store prompts for it on first use if
 *      missing on Android < 14); grant "Steps" read access, then confirm
 *      `getSnapshot()` matches Health Connect's own step total for today.
 *   5. Deny permission on both platforms and confirm `requestPermission()`
 *      resolves `'denied'` (not a thrown error) and the app falls back
 *      gracefully (see `useStepData.ts`'s `permissionStatus` handling).
 *   6. Confirm `info.plist` / `AndroidManifest.xml` entries added by the
 *      libraries' Expo config plugins (see `app.json` `plugins`) actually
 *      land in the generated native project (`npx expo prebuild --clean`).
 */
import { Platform } from 'react-native';
import type { HistoricalStepQuery, PermissionStatus, StepDay, StepSnapshot } from './types';
import type { StepDataProvider } from './useStepData';
import { normalizeSteps } from './normalize';
import { currentUser } from './mockData';
import { buildInclusiveLocalDateRange, localDateKey } from './dateRange';

const REFERENCE_STRIDE_CM = 71;
const HISTORY_DAYS = 7;

// Historical import: see lib/historicalStepImport.ts / lib/dateRange.ts.
// Clamped defensively even though the onboarding UI only ever offers up to
// 90 days, and batched so a 90-day import doesn't fire 90 concurrent native
// HealthKit/Health Connect calls at once.
const MAX_HISTORICAL_DAYS = 90;
const HISTORICAL_FETCH_BATCH_SIZE = 14;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Local-calendar-day list for `query`, clamped to the most recent MAX_HISTORICAL_DAYS if a caller asks for more. */
function clampHistoricalRange(query: HistoricalStepQuery): Date[] {
  const days = buildInclusiveLocalDateRange(query.startDate, query.endDate);
  return days.length <= MAX_HISTORICAL_DAYS ? days : days.slice(days.length - MAX_HISTORICAL_DAYS);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// ---------------------------------------------------------------------------
// iOS: HealthKit via react-native-health
// ---------------------------------------------------------------------------

async function requestHealthKitPermission(): Promise<PermissionStatus> {
  const AppleHealthKit = (await import('react-native-health')).default;
  const { HealthPermission } = await import('react-native-health');

  const permissions = {
    permissions: {
      read: [HealthPermission.StepCount, HealthPermission.DistanceWalkingRunning],
      write: [],
    },
  };

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(permissions, (error) => {
      // react-native-health's initHealthKit callback fires on completion of
      // the permission *request*, not on grant/deny — iOS never tells apps
      // whether a read permission was actually granted, for privacy reasons.
      // A non-error callback means the user was able to respond to the
      // prompt (or had already done so); we treat that as 'granted' and let
      // getSnapshot()'s query results (empty vs populated) be the real
      // signal of whether data is actually readable.
      if (error) {
        resolve('denied');
      } else {
        resolve('granted');
      }
    });
  });
}

function getStepsForDay(AppleHealthKit: typeof import('react-native-health').default, day: Date): Promise<number> {
  const start = startOfDay(day);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return new Promise((resolve) => {
    AppleHealthKit.getStepCount(
      { date: start.toISOString(), startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err, results) => {
        if (err || !results) {
          resolve(0);
        } else {
          resolve(Math.round(results.value ?? 0));
        }
      },
    );
  });
}

async function getHealthKitSnapshot(): Promise<StepSnapshot> {
  const AppleHealthKit = (await import('react-native-health')).default;
  const today = startOfDay(new Date());

  const days: Date[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  const rawStepsByDay = await Promise.all(days.map((d) => getStepsForDay(AppleHealthKit, d)));
  const weeklyHistory: StepDay[] = days.map((d, i) => ({
    date: isoDate(d),
    rawSteps: rawStepsByDay[i],
    normalizedSteps: normalizeSteps(rawStepsByDay[i], currentUser, REFERENCE_STRIDE_CM),
  }));

  const todaySteps = rawStepsByDay[rawStepsByDay.length - 1];

  return {
    todaySteps,
    dailyGoal: currentUser.dailyGoal,
    streakDays: 0, // streaks are derived server-side from persisted step_records, not the sensor layer
    source: 'healthkit',
    weeklyHistory,
  };
}

/**
 * Historical import over an arbitrary range (7/30/90 days), reusing the same
 * per-day `getStepCount` call as `getHealthKitSnapshot`'s fixed 7-day window
 * — HealthKit already returns each day's request pre-aggregated by the OS
 * (it sums all sources/devices for that day into one `value`), so this is
 * not a naive re-summation of raw samples. Fetched in small batches rather
 * than one giant `Promise.all` so a 90-day import doesn't fire 90 concurrent
 * native-bridge calls at once. A day HealthKit has no data for (or that
 * errors) resolves to 0 raw steps here, same as the existing snapshot path —
 * the native callback doesn't distinguish "queried and genuinely zero" from
 * "no samples existed to query" in the shape this library exposes today.
 */
async function getHealthKitHistoricalDays(query: HistoricalStepQuery): Promise<StepDay[]> {
  const AppleHealthKit = (await import('react-native-health')).default;
  const days = clampHistoricalRange(query);
  const records: StepDay[] = [];
  for (const batch of chunk(days, HISTORICAL_FETCH_BATCH_SIZE)) {
    const rawStepsByDay = await Promise.all(batch.map((d) => getStepsForDay(AppleHealthKit, d)));
    batch.forEach((d, i) => {
      records.push({
        date: localDateKey(d),
        rawSteps: rawStepsByDay[i],
        normalizedSteps: normalizeSteps(rawStepsByDay[i], currentUser, REFERENCE_STRIDE_CM),
      });
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Android: Health Connect via react-native-health-connect
// ---------------------------------------------------------------------------

async function requestHealthConnectPermission(): Promise<PermissionStatus> {
  const HealthConnect = await import('react-native-health-connect');
  const initialized = await HealthConnect.initialize();
  if (!initialized) return 'denied';

  const granted = await HealthConnect.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
  const hasStepsRead = granted.some(
    (p: any) => p.recordType === 'Steps' && p.accessType === 'read',
  );
  return hasStepsRead ? 'granted' : 'denied';
}

function getStepsForDayHealthConnect(
  HealthConnect: typeof import('react-native-health-connect'),
  day: Date,
): Promise<number> {
  const start = startOfDay(day);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return HealthConnect.aggregateRecord({
    recordType: 'Steps',
    timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
  }).then((result) => Math.round((result as any)?.COUNT_TOTAL ?? 0));
}

async function getHealthConnectSnapshot(): Promise<StepSnapshot> {
  const HealthConnect = await import('react-native-health-connect');
  const today = startOfDay(new Date());

  const days: Date[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }

  const rawStepsByDay = await Promise.all(days.map((d) => getStepsForDayHealthConnect(HealthConnect, d)));

  const weeklyHistory: StepDay[] = days.map((d, i) => ({
    date: isoDate(d),
    rawSteps: rawStepsByDay[i],
    normalizedSteps: normalizeSteps(rawStepsByDay[i], currentUser, REFERENCE_STRIDE_CM),
  }));

  const todaySteps = rawStepsByDay[rawStepsByDay.length - 1];

  return {
    todaySteps,
    dailyGoal: currentUser.dailyGoal,
    streakDays: 0,
    source: 'googlefit',
    weeklyHistory,
  };
}

/** Historical import counterpart to getHealthKitHistoricalDays — see its doc comment for the batching/zero-vs-missing rationale, which applies identically here. */
async function getHealthConnectHistoricalDays(query: HistoricalStepQuery): Promise<StepDay[]> {
  const HealthConnect = await import('react-native-health-connect');
  const days = clampHistoricalRange(query);
  const records: StepDay[] = [];
  for (const batch of chunk(days, HISTORICAL_FETCH_BATCH_SIZE)) {
    const rawStepsByDay = await Promise.all(batch.map((d) => getStepsForDayHealthConnect(HealthConnect, d)));
    batch.forEach((d, i) => {
      records.push({
        date: localDateKey(d),
        rawSteps: rawStepsByDay[i],
        normalizedSteps: normalizeSteps(rawStepsByDay[i], currentUser, REFERENCE_STRIDE_CM),
      });
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Public provider
// ---------------------------------------------------------------------------

export const healthStepProvider: StepDataProvider = {
  async requestPermission() {
    try {
      if (Platform.OS === 'ios') return await requestHealthKitPermission();
      if (Platform.OS === 'android') return await requestHealthConnectPermission();
      return 'denied';
    } catch {
      // Native module isn't linked (e.g. running in Expo Go, or web) —
      // fail closed rather than throwing out of onboarding.
      return 'denied';
    }
  },
  async getSnapshot() {
    try {
      if (Platform.OS === 'ios') return await getHealthKitSnapshot();
      if (Platform.OS === 'android') return await getHealthConnectSnapshot();
    } catch {
      // fall through to the empty snapshot below
    }
    return {
      todaySteps: 0,
      dailyGoal: currentUser.dailyGoal,
      streakDays: 0,
      source: Platform.OS === 'ios' ? 'healthkit' : 'googlefit',
      weeklyHistory: [],
    };
  },
  async getHistoricalDailySteps(query) {
    try {
      if (Platform.OS === 'ios') return await getHealthKitHistoricalDays(query);
      if (Platform.OS === 'android') return await getHealthConnectHistoricalDays(query);
    } catch {
      // Native module isn't linked, or a query failed outright — fail closed
      // to an empty history rather than throwing out of onboarding; the
      // import service (lib/historicalStepImport.ts) treats an empty result
      // as its 'no-data' status, which onboarding already handles gracefully.
    }
    return [];
  },
};
