/**
 * Extracts a human-readable message from a caught value, for display in an
 * error banner/Alert. Prefers `instanceof Error`, but falls back to
 * duck-typing a string `message` property rather than giving up immediately.
 *
 * Why this exists: every `lib/api/*.ts` function does `if (error) throw
 * error;` on Supabase's raw PostgrestError, so most caught values in this
 * app ARE that error, not a hand-thrown `new Error(...)`. Confirmed live
 * against this app's web build that a plain `e instanceof Error` check
 * silently fails for those — the server returns a clean, actionable message
 * (e.g. "No StepLeague user found with that email"), but every screen using
 * that check discarded it for a generic fallback instead. Duck-typing
 * `message` is strictly more robust for this purpose regardless of the
 * exact reason instanceof fails (bundler class transpilation, cross-realm
 * prototype mismatch, etc.) — every error shape actually worth surfacing to
 * a user has a string `message`.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return fallback;
}
