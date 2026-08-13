import { selectPrimaryActiveChallenge } from '../activeChallenge';
import type { Challenge } from '../types';

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    title: 'Test challenge',
    subtitle: '',
    variant: 'active',
    status: 'active',
    progress: 0,
    participants: 2,
    startsAt: '2026-08-01',
    visibility: 'public',
    ...overrides,
  };
}

describe('selectPrimaryActiveChallenge', () => {
  it('returns null when there are no challenges at all', () => {
    expect(selectPrimaryActiveChallenge([])).toBeNull();
  });

  it('returns null when nothing is joined (all joinable)', () => {
    const challenges = [makeChallenge({ id: 'a', variant: 'joinable', status: undefined })];
    expect(selectPrimaryActiveChallenge(challenges)).toBeNull();
  });

  it('returns null when a joined challenge is not currently in its active window', () => {
    const challenges = [
      makeChallenge({ id: 'a', status: 'upcoming' }),
      makeChallenge({ id: 'b', status: 'completed' }),
      makeChallenge({ id: 'c', status: 'expired' }),
    ];
    expect(selectPrimaryActiveChallenge(challenges)).toBeNull();
  });

  it('surfaces the single active challenge with no extras', () => {
    const challenge = makeChallenge({ id: 'a', progress: 0.4 });
    const result = selectPrimaryActiveChallenge([challenge]);
    expect(result).toEqual({ primary: challenge, extraCount: 0 });
  });

  it('ignores joinable/upcoming/finished challenges mixed in with the active one', () => {
    const active = makeChallenge({ id: 'active', progress: 0.5 });
    const challenges = [
      makeChallenge({ id: 'joinable', variant: 'joinable', status: undefined }),
      makeChallenge({ id: 'upcoming', status: 'upcoming' }),
      active,
      makeChallenge({ id: 'expired', status: 'expired' }),
    ];
    const result = selectPrimaryActiveChallenge(challenges);
    expect(result?.primary.id).toBe('active');
    expect(result?.extraCount).toBe(0);
  });

  it('picks the highest-progress active challenge as most relevant, and counts the rest', () => {
    const challenges = [
      makeChallenge({ id: 'low', progress: 0.2 }),
      makeChallenge({ id: 'high', progress: 0.9 }),
      makeChallenge({ id: 'mid', progress: 0.5 }),
    ];
    const result = selectPrimaryActiveChallenge(challenges);
    expect(result?.primary.id).toBe('high');
    expect(result?.extraCount).toBe(2);
  });

  it('breaks a progress tie by the earliest startsAt', () => {
    const challenges = [
      makeChallenge({ id: 'later', progress: 0.3, startsAt: '2026-08-10' }),
      makeChallenge({ id: 'earlier', progress: 0.3, startsAt: '2026-08-01' }),
    ];
    const result = selectPrimaryActiveChallenge(challenges);
    expect(result?.primary.id).toBe('earlier');
  });

  it('breaks a full tie (same progress and startsAt) by id, for a deterministic pick', () => {
    const challenges = [
      makeChallenge({ id: 'zeta', progress: 0, startsAt: '2026-08-01' }),
      makeChallenge({ id: 'alpha', progress: 0, startsAt: '2026-08-01' }),
    ];
    const result = selectPrimaryActiveChallenge(challenges);
    expect(result?.primary.id).toBe('alpha');
  });
});
