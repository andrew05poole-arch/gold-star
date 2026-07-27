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

/** ISO timestamp -> "3m ago" / "5h ago" / "2d ago" / "3w ago" (falls back to a short date beyond ~4 weeks). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type RankDelta = { direction: 'up' | 'down' | 'flat'; amount: number };

export function rankDelta(rank: number, previousRank: number): RankDelta {
  const diff = previousRank - rank; // positive = moved up
  if (diff > 0) return { direction: 'up', amount: diff };
  if (diff < 0) return { direction: 'down', amount: -diff };
  return { direction: 'flat', amount: 0 };
}
