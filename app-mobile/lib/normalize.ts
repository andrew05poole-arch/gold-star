/**
 * Step Normalizer (MVP) — distance-equivalent normalization.
 * See docs/PRD.md §13.2. Placeholder formula, to be validated on real data.
 */
import type { User } from './types';

const DEFAULT_STRIDE_CM = 71;
const HEIGHT_TO_STRIDE = 0.415;

export function strideFor(user: Pick<User, 'strideLengthCm' | 'heightCm'>): number {
  if (user.strideLengthCm) return user.strideLengthCm;
  if (user.heightCm) return user.heightCm * HEIGHT_TO_STRIDE;
  return DEFAULT_STRIDE_CM;
}

export function normalizeSteps(
  rawSteps: number,
  user: Pick<User, 'strideLengthCm' | 'heightCm'>,
  referenceStrideCm = DEFAULT_STRIDE_CM,
): number {
  return Math.round(rawSteps * (strideFor(user) / referenceStrideCm));
}
