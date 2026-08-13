import { formatRelativeTime } from '../format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-13T12:00:00.000Z');

  it('returns "just now" for a timestamp less than a minute old', () => {
    const from = new Date(now.getTime() - 30_000).toISOString(); // 30s ago
    expect(formatRelativeTime(from, now)).toBe('just now');
  });

  it('returns "just now" for a timestamp exactly at now', () => {
    expect(formatRelativeTime(now.toISOString(), now)).toBe('just now');
  });

  it('formats minutes ago, just under the hour boundary', () => {
    const from = new Date(now.getTime() - 3 * 60_000).toISOString(); // 3m ago
    expect(formatRelativeTime(from, now)).toBe('3m ago');

    const almostHour = new Date(now.getTime() - 59 * 60_000).toISOString();
    expect(formatRelativeTime(almostHour, now)).toBe('59m ago');
  });

  it('formats hours ago starting exactly at the 60-minute boundary', () => {
    const oneHour = new Date(now.getTime() - 60 * 60_000).toISOString();
    expect(formatRelativeTime(oneHour, now)).toBe('1h ago');

    const from = new Date(now.getTime() - 2 * 3_600_000).toISOString(); // 2h ago
    expect(formatRelativeTime(from, now)).toBe('2h ago');

    const almostDay = new Date(now.getTime() - 23 * 3_600_000).toISOString();
    expect(formatRelativeTime(almostDay, now)).toBe('23h ago');
  });

  it('formats days ago starting exactly at the 24-hour boundary', () => {
    const oneDay = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    expect(formatRelativeTime(oneDay, now)).toBe('1d ago');

    const from = new Date(now.getTime() - 3 * 86_400_000).toISOString(); // 3d ago
    expect(formatRelativeTime(from, now)).toBe('3d ago');
  });

  it('never returns a negative/future-looking duration for a timestamp after "now"', () => {
    const future = new Date(now.getTime() + 5 * 60_000).toISOString();
    expect(formatRelativeTime(future, now)).toBe('just now');
  });
});
