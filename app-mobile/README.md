# StepLeague — Mobile App (Expo)

React Native + Expo (expo-router) scaffold for the **DailyStep** MVP. See
`../docs/PRD.md` for product requirements and `../design/DESIGN.md` for the
design system (the values in `lib/theme.ts` mirror it).

## Run it

```bash
cd app-mobile
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on your phone (iOS/Android), or press
`i` / `a` for a simulator. Web preview: press `w`.

> Note: `npx expo install` is blocked in some sandboxes (it calls a gated Expo
> API). Plain `npm install` works because dependency versions are already
> pinned in `package.json` to the Expo SDK 56 set.

## What's here

Five screens for the DailyStep world, with **mock data** (no backend yet):

| Route | Screen |
|---|---|
| `app/onboarding.tsx` | Onboarding & permissions (stubbed step-permission grant) |
| `app/(tabs)/home.tsx` | Daily dashboard — step counter, streak, goal, rival sliver |
| `app/(tabs)/leaderboard.tsx` | Weekly friends leaderboard + invite CTA |
| `app/(tabs)/rival.tsx` | AI rival head-to-head comparison |
| `app/(tabs)/streaks.tsx` | Streak calendar + active/joinable challenges |

## Structure

- `lib/theme.ts` — design tokens (colors, spacing, radii, typography).
- `lib/types.ts` — domain types (mirrors PRD §13.1).
- `lib/mockData.ts` — static fake data.
- `lib/normalize.ts` — Step Normalizer (PRD §13.2).
- `lib/useStepData.ts` — step-data hook over a **swappable provider**. Ships
  `mockStepProvider`; swap `activeProvider` for real HealthKit / Google Fit
  later (needs a native dev-client build, not Expo Go).
- `lib/useOnboardingStatus.ts` — onboarding flag (in-memory; swap for
  AsyncStorage to persist).
- `components/` — presentational components (props in → JSX out).

## Deferred

Real Health integration, backend/auth, the non-MVP Worlds, and the Celebrities
feature — all tracked in `../docs/PRD.md`.
