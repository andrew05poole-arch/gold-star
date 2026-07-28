import { errorMessage } from '../errorMessage';

describe('errorMessage', () => {
  it('returns the message from a real Error instance', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('duck-types a string message property off a non-Error object', () => {
    // Mirrors the shape of a Supabase PostgrestError, which this app's web
    // build was found to not reliably satisfy `instanceof Error` for.
    const postgrestLike = { code: 'P0001', message: 'No StepLeague user found with that email' };
    expect(errorMessage(postgrestLike, 'fallback')).toBe('No StepLeague user found with that email');
  });

  it('falls back when there is no usable message', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
    expect(errorMessage('a plain string', 'fallback')).toBe('fallback');
    expect(errorMessage({ code: 'P0001' }, 'fallback')).toBe('fallback');
  });

  it('falls back when message is present but not a string', () => {
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });
});
