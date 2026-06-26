/** Small presentation helpers. */

/** 12408 -> "12,408" */
export function formatSteps(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 9400 -> "9.4k" (used in compact bars). */
export function formatCompact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

/** Milliseconds remaining -> "2d 4h" / "4h 12m". */
export function formatCountdown(msRemaining: number): string {
  const total = Math.max(0, msRemaining);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export type RankDelta = { direction: 'up' | 'down' | 'flat'; amount: number };

export function rankDelta(rank: number, previousRank: number): RankDelta {
  const diff = previousRank - rank; // positive = moved up
  if (diff > 0) return { direction: 'up', amount: diff };
  if (diff < 0) return { direction: 'down', amount: -diff };
  return { direction: 'flat', amount: 0 };
}
