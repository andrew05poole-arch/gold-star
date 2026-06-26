/**
 * Step data hook over a swappable provider.
 *
 * Today it ships `mockStepProvider` (fake data + simulated async + stub
 * permission). To wire real data later (Apple HealthKit / Google Fit — which
 * needs a native dev-client build, not Expo Go), implement the
 * `StepDataProvider` interface and swap `activeProvider` below. No consuming
 * component needs to change.
 */
import { useEffect, useRef, useState } from 'react';
import { currentUser } from './mockData';
import { normalizeSteps } from './normalize';
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

// Swap this for a real provider when native Health integration lands.
const activeProvider: StepDataProvider = mockStepProvider;

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
