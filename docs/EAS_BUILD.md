# EAS build & real-device testing runbook

How to get StepLeague onto a real iPhone / Android phone with the real
HealthKit / Health Connect integration turned on. **No Mac required** — EAS
builds iOS apps on Expo's cloud macOS machines; you just install the result
on a phone.

All commands run from `app-mobile/`.

## 0. Accounts you need (browser, one-time)

| What | Where | Cost | Needed for |
|------|-------|------|-----------|
| Expo account | https://expo.dev/signup | Free | Everything |
| Apple Developer Program | https://developer.apple.com/programs/enroll | $99/yr | iOS builds only |
| Google Play Console | https://play.google.com/console/signup | $25 once | Play Store only — NOT needed to sideload a test APK |

Android testing needs only the free Expo account. iOS needs the Apple
enrollment (individual account is simplest; approval can take a day or two).

## 1. One-time project setup

```bash
# from app-mobile/
npx eas-cli login                    # sign in to your Expo account
npx eas-cli init                     # links this app to your Expo account,
                                     # writes extra.eas.projectId into app.json
```

### Supabase env vars for the cloud build
The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(see `lib/supabase.ts`). Locally these come from `.env.local`; the cloud
build needs them too. These are `EXPO_PUBLIC_` values — the anon key is
designed to be shipped in the client and is guarded by RLS — so it's safe to
register them as EAS environment variables (they are NOT committed to the
repo):

```bash
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR-PROJECT.supabase.co" --environment development --environment preview --environment production --visibility plaintext
npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR-ANON-KEY" --environment development --environment preview --environment production --visibility plaintext
```
(Copy the two values from your `.env.local`.)

## 2. Build a development client

A development build includes the native HealthKit / Health Connect modules
AND the dev menu, so you can iterate over-the-air after the first build.

### Android (fastest — free, no Apple account)
```bash
npx eas-cli build --profile development --platform android
```
EAS builds in the cloud (~10–20 min) and gives you a QR code / link. Open it
on your Android phone to install the APK. (You may need to allow "install
from unknown sources.")

### iOS (needs the Apple Developer enrollment from step 0)
```bash
npx eas-cli device:create      # registers your iPhone's UDID — follow the link/QR on the device
npx eas-cli build --profile development --platform ios
```
EAS prompts to log into your Apple account and provisions signing
automatically. When the build finishes, open the link on your iPhone to
install.

## 3. Turn on the real health provider

The app defaults to the mock step provider. To exercise real HealthKit /
Health Connect, set the flag (see `lib/useStepData.ts`):

```bash
npx eas-cli env:create --name EXPO_PUBLIC_USE_REAL_HEALTH_PROVIDER --value "true" --environment development --visibility plaintext
```
Rebuild (or, for JS-only changes, `npx eas-cli update --channel development`)
so the flag reaches the device. Then follow the on-device verification
checklist in the header comment of `lib/healthStepProvider.ts` (grant the
permission sheet, confirm today's real step count matches the Health app /
Health Connect, confirm denial falls back gracefully).

## 4. Iterating after the first build

- **JS/React changes**: `npx eas-cli update --channel development` — pushes
  over-the-air to the installed dev client, no rebuild needed.
- **Native changes** (new native module, app.json plugin/permission change):
  a fresh `eas build` is required.

## Notes

- **Bundle identifier**: currently `com.stepleague.app` for both iOS
  (`ios.bundleIdentifier`) and Android (`android.package`) in `app.json`. If
  the App Store rejects it as taken, or you prefer your own reverse-DNS
  namespace, change that one string in both places **before your first iOS
  build** (it becomes hard to change once submitted).
- **TestFlight** (wider iOS testing beyond your own devices) and **Play
  Store internal testing** use the same builds via
  `eas build --profile preview` + `eas submit` — a later step once the dev
  client is validated.
