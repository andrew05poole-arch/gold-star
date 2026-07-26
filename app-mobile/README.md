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

## What's here

Five screens for the DailyStep world, backed by a real **Supabase**
(Postgres + Auth) backend. The step *sensor* is still mocked — see
`lib/useStepData.ts` — but it writes through to real `step_records` rows, so
streaks, the leaderboard, and the rival target all operate on persisted data.

| Route | Screen |
|---|---|
| `app/login.tsx` | Passwordless email OTP sign-in |
| `app/onboarding.tsx` | Creates the user's `profiles` row (stubbed step-permission grant) |
| `app/(tabs)/home.tsx` | Daily dashboard — step counter, streak, goal, rival sliver |
| `app/(tabs)/leaderboard.tsx` | Weekly friends leaderboard + invite-by-email |
| `app/(tabs)/rival.tsx` | AI rival head-to-head comparison |
| `app/(tabs)/streaks.tsx` | Streak calendar + active/joinable challenges |

## Structure

- `lib/theme.ts` — design tokens (colors, spacing, radii, typography).
- `lib/types.ts` — domain types (mirrors PRD §13.1).
- `lib/mockData.ts` — fallback fake data, used only before a live fetch resolves.
- `lib/normalize.ts` — Step Normalizer (PRD §13.2; mirrored server-side in
  `supabase/migrations/0001_init.sql`).
- `lib/useStepData.ts` — step-data hook over a **swappable provider**. Ships
  `mockStepProvider`; swap `activeProvider` for real HealthKit / Google Fit
  later (needs a native dev-client build, not Expo Go). Each snapshot is
  upserted into `step_records` so the rest of the backend sees real data.
- `lib/supabase.ts` — Supabase client (AsyncStorage-backed session storage).
- `lib/useAuth.ts` — session state (context) + `signInWithOtp` / `verifyOtp` / `signOut`.
- `lib/api/` — thin typed wrappers around Supabase tables/RPCs (profile,
  step records, streaks, leaderboard, rival, challenges).
- `components/` — presentational components (props in → JSX out).

## Deferred

Real Health integration, the non-MVP Worlds, and the Celebrities feature —
all tracked in `../docs/PRD.md`.
