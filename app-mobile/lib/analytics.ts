/**
 * Minimal placeholder event logger. StepLeague has no analytics/telemetry
 * vendor wired up anywhere in this repo yet (no PostHog/Segment/Amplitude/
 * custom logger — verified by search before adding this). This exists so
 * the historical-import flow's call sites are already in place and only
 * need `track`'s body swapped for a real vendor SDK once one is chosen,
 * rather than every event needing to be found and re-added later.
 *
 * Never pass raw step counts, dates, or other health data as a property —
 * only shape/outcome metadata (status, counts, booleans, platform).
 */
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, properties?: AnalyticsProperties): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, properties ?? {});
  }
}
