/**
 * Step data hook over a swappable provider.
 *
 * Ships `mockStepProvider` (fake data + simulated async + stub permission) as
 * the default, and a real `healthStepProvider` (Apple HealthKit / Google Fit
 * Health Connect, see `./healthStepProvider.ts`) behind the
 * `USE_REAL_HEALTH_PROVIDER` flag below. No consuming component needs to
 * change regardless of which is active — both implement `StepDataProvider`.
 */
import { useEffect, useRef, useState } from 'react';
import { currentUser } from './mockData';
import { normalizeSteps } from './normalize';
import { upsertTodayStepRecord } from './api/stepRecords';
import type { PermissionStatus, StepDay, StepSnapshot } from './types';

export interface StepDataProvider {
  requestPermission(): Promise<PermissionStatus>;
  getSnapshot(): Promise<StepSnapshot>;
}

const REFERENCE_STRIDE_CM = 71;

function seededWeeklyHistory(): StepDay[] {
  // Stable per module-load fake week (most-recent-last).
  const base = [9200, 11850, 7600, 4200, 12400, 13980, 8420];
  const today = new Date();
  return base.map((rawSteps, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (base.length - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      rawSteps,
      normalizedSteps: normalizeSteps(rawSteps, currentUser, REFERENCE_STRIDE_CM),
    };
  });
}

const mockStepProvider: StepDataProvider = {
  async requestPermission() {
    await delay(600);
    return 'granted';
  },
  async getSnapshot() {
    await delay(450);
    const weeklyHistory = seededWeeklyHistory();
    const today = weeklyHistory[weeklyHistory.length - 1];
    return {
      todaySteps: today.rawSteps,
      dailyGoal: currentUser.dailyGoal,
      streakDays: 6,
      source: 'mock',
      weeklyHistory,
    };
  },
};

/**
 * Gates the real `healthStepProvider` (react-native-health /
 * react-native-health-connect). Defaults to `false` — those libraries have
 * native modules that only exist in a custom EAS dev-client build; Expo Go
 * and CI/test environments do not have them linked, so leaving this on by
 * default would break `npm start`/Expo Go for every contributor and crash
 * Jest. A human should flip this only after building a dev client and
 * manually verifying the flow on a real device (see the checklist in
 * `healthStepProvider.ts`).
 *
 * Toggle via `EXPO_PUBLIC_USE_REAL_HEALTH_PROVIDER=true` (in `.env` or the
 * shell) once that verification is done, or flip the fallback below.
 */
export const USE_REAL_HEALTH_PROVIDER =
  process.env.EXPO_PUBLIC_USE_REAL_HEALTH_PROVIDER === 'true';

function resolveProvider(): StepDataProvider {
  if (USE_REAL_HEALTH_PROVIDER) {
    // Lazy require so `mockStepProvider` (and therefore Expo Go / Jest) never
    // pays the cost of importing native-module-backed libraries that aren't
    // linked in those environments.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { healthStepProvider } = require('./healthStepProvider') as typeof import('./healthStepProvider');
    return healthStepProvider;
  }
  return mockStepProvider;
}

const activeProvider: StepDataProvider = resolveProvider();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useStepData() {
  const [data, setData] = useState<StepSnapshot | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [isLoading, setIsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    activeProvider
      .getSnapshot()
      .then((snapshot) => {
        if (mounted.current) setData(snapshot);
        // Best-effort write-through so streaks/leaderboard/rival operate on real
        // persisted rows even while the sensor layer itself is still mocked. No-ops
        // (silently) if the user has no session/profile yet.
        upsertTodayStepRecord(snapshot.todaySteps, snapshot.source).catch(() => {});
      })
      .finally(() => {
        if (mounted.current) setIsLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  async function requestPermission(): Promise<PermissionStatus> {
    const status = await activeProvider.requestPermission();
    if (mounted.current) setPermissionStatus(status);
    return status;
  }

  return { data, permissionStatus, isLoading, requestPermission };
}
