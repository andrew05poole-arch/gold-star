# StepLeague — Mobile App (Expo)

React Native + Expo (expo-router) scaffold for the **DailyStep** MVP. See
`../docs/PRD.md` for product requirements, `../design/DESIGN.md` for the
design system (the values in `lib/theme.ts` mirror it), and
`../supabase/README.md` for the backend.

## Run it

```bash
cd app-mobile
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npx expo start
```

Then scan the QR code with **Expo Go** on your phone (iOS/Android), or press
`i` / `a` for a simulator. Web preview: press `w`.

> Note: `npx expo install` is blocked in some sandboxes (it calls a gated Expo
> API). Plain `npm install` works because dependency versions are already
> pinned in `package.json` to the Expo SDK 56 set.

Without the Supabase env vars set, the app still boots (you'll see a console
warning) but auth, leaderboard, streaks, and challenges have nothing to talk
to — set up the backend first (see `../supabase/README.md`).

## Testing

```bash
cd app-mobile
npm run typecheck   # tsc --noEmit
npm test            # jest (jest-expo preset)
```

Both run automatically on every PR via GitHub Actions (`.github/workflows/ci.yml`).
Test coverage today is intentionally a smoke layer, not exhaustive:

- `lib/__tests__/normalize.test.ts` — the step-normalization formula (pure function).
- `app/__tests__/index.test.tsx` — the auth/profile navigation gate
  (`app/index.tsx`), with `useAuth` and `getMyProfile` mocked.

There is no end-to-end/device test suite — screens that talk to Supabase are
verified manually (see "Manual verification" below) since the sandbox this
was built in has no live Supabase project or physical device to test against.

### Manual verification (do this before shipping)

1. Apply every file in `supabase/migrations/` in numeric order to a real
   Supabase project (see `../supabase/README.md`) — **none of the SQL in this
   repo has been executed against a live database**; every migration PR says
   so explicitly and each one needs a human to run it once and sanity-check
   the RPCs it adds.
2. Fill in `app-mobile/.env.local` with that project's URL/anon key.
3. `npx expo start`, open in Expo Go, and click through: sign up (email
   OTP) → onboarding (height + optional invite code) → Home → League →
   Rival → Streaks → Profile → sign out.
4. Specifically exercise the things unit tests can't reach: sending/accepting
   a friend request, sharing + redeeming an invite code, joining a preset
   challenge and watching its progress bar move as you log steps, creating a
   custom challenge, adjusting the rival difficulty band, removing a friend.

## What's here

Backed by a real **Supabase** (Postgres + Auth) backend — every screen below
reads/writes live data except the step *sensor* itself, which defaults to a
mock provider (see `lib/useStepData.ts`) that still writes through to real
`step_records` rows.

| Route | Screen |
|---|---|
| `app/login.tsx` | Passwordless email OTP sign-in |
| `app/onboarding.tsx` | Creates the `profiles` row; optional height input + invite-code redemption; step-permission grant |
| `app/(tabs)/home.tsx` | Daily dashboard — step counter, streak, goal, rival sliver |
| `app/(tabs)/leaderboard.tsx` | Weekly friends leaderboard, pending friend requests, invite by email or shareable code, long-press to remove a friend |
| `app/(tabs)/rival.tsx` | AI rival head-to-head comparison + chill/even/pushy difficulty toggle |
| `app/(tabs)/streaks.tsx` | Streak calendar, active/history challenges, joinable presets, custom challenge creation |
| `app/(tabs)/profile.tsx` | Account info + sign out |

## Structure

- `lib/theme.ts` — design tokens (colors, spacing, radii, typography).
- `lib/types.ts` — domain types (mirrors PRD §13.1).
- `lib/mockData.ts` — fallback fake data, used only before a live fetch resolves.
- `lib/normalize.ts` — Step Normalizer (PRD §13.2; mirrored server-side in
  `supabase/migrations/0001_init.sql`).
- `lib/useStepData.ts` — step-data hook over a **swappable provider**. Ships
  `mockStepProvider` as the default; `lib/healthStepProvider.ts` implements a
  real HealthKit (iOS) / Health Connect (Android) provider behind the
  `EXPO_PUBLIC_USE_REAL_HEALTH_PROVIDER` flag — off by default because those
  native modules need an EAS dev-client build and can't run in Expo Go. Each
  snapshot is upserted into `step_records` so the rest of the backend sees
  real data regardless of which provider is active.
- `lib/supabase.ts` — Supabase client (AsyncStorage-backed session storage).
- `lib/useAuth.ts` — session state (context) + `signInWithOtp` / `verifyOtp` / `signOut`.
- `lib/api/` — thin typed wrappers around Supabase tables/RPCs (profile,
  step records, streaks, leaderboard, rival, challenges).
- `components/` — presentational components (props in → JSX out).

## Deferred

Real Health integration is implemented but not yet enabled by default (see
above — needs a device build to verify). The non-MVP Worlds, Presence
scoring, geo leaderboards, advanced AI coaching, social feed, and the
Celebrities feature are all still future work — see `../docs/PRD.md` §10.
