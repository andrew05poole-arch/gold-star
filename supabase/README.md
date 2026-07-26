# StepLeague — Supabase Backend

Schema + RLS policies for the DailyStep MVP. Mirrors the data model and
algorithms documented in `../docs/PRD.md` §13.

## Set up a project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run every file in `migrations/` in numeric order
   (`0001_init.sql` through `0007_create_challenge.sql` as of this writing —
   run `ls migrations/` to confirm you have the latest) — creates tables,
   triggers, RPCs, RLS policies. Then optionally run `seed.sql` (adds two
   joinable challenge presets matching the prototype).
   **None of this SQL has been executed against a live Supabase project in
   development** — every migration was written and typechecked against the
   client only; running the full sequence once and sanity-checking each RPC
   (see below) is a required manual step, not optional polish.
3. In **Authentication -> Providers**, ensure **Email** is enabled. The app
   uses passwordless OTP (`signInWithOtp`), so disable "Confirm email" /
   leave magic-link OTP defaults — no password flow is wired up client-side.
4. In **Project Settings -> API**, copy the **Project URL** and **anon
   public** key into `app-mobile/.env.local` (see `app-mobile/.env.example`).

## Schema overview

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; display name, daily goal, stride/height for normalization |
| `step_records` | One row per user per day; `raw_steps` in, `normalized_steps` computed by trigger (§13.2) |
| `streaks` | Current/longest streak + freezes remaining; recomputed by trigger on every step-record write (§13.5) |
| `friendships` | Directional rows; `pending` until the recipient accepts via `respond_to_friend_request`, then mirrored as `accepted` in both directions |
| `challenges` / `challenge_participants` | Joinable challenge presets + per-user progress |
| `rival_profiles` | Per-user AI rival config (name, difficulty band); auto-created via trigger when a `profiles` row is inserted (`0003_rival_profile_onboarding.sql`) |

Two RPCs do the heavier lifting under RLS (`security definer`, scoped to the
calling user):

- `get_leaderboard(p_user_id)` — current user + accepted friends, ranked by
  this ISO week's `normalized_steps`, with `previous_rank` derived by
  re-ranking the same friend set over last week's rows (no cron job needed).
- `get_rival_target(p_user_id)` — trailing 7-day normalized average ×
  difficulty-band factor, clamped to `[3000, 20000]` (§13.3).

`recompute_challenge_progress(p_user_id)` (`0002_challenge_progress.sql`)
recomputes `challenge_participants.progress` for all of a user's joined
challenges whenever their `step_records` changes (same after-insert-or-update
trigger pattern as `recompute_streak`), over each participant's own
`[joined_at, joined_at + duration_days - 1]` window:

- `stepsPerDay` — progress = the window's current day's `normalized_steps`.
- `totalSteps` — progress = sum of `normalized_steps` across the window.
- `daysStreak` — progress = count of days in the window whose
  `normalized_steps` meet the challenge's own `goal_value`.

Friend requests (§7/§8, `0004_friend_requests.sql`):

- `add_friend_by_email(p_email)` — sends a `pending` friend request to the
  user with that email (directional, requester -> recipient). If the target
  already sent *us* a pending request, this accepts it instead of creating a
  duplicate.
- `respond_to_friend_request(p_requester_id, p_accept)` — the recipient
  accepts (flips to `accepted` and mirrors the reverse row) or declines
  (deletes the row).
- `get_pending_friend_requests()` — incoming pending requests for the
  current user.

Shareable invite codes (issue #7, `0005_referral_codes.sql`):

- `profiles.referral_code` — unique 8-char code auto-generated for every
  profile on insert (backfilled for existing rows). Shared via the native
  Share sheet on the Leaderboard tab ("Join me on StepLeague! Use code
  ABC123 when you sign up.") so a user can invite someone who hasn't
  installed the app yet — no deep link required.
- `add_friend_by_referral_code(p_code)` — same pending-request semantics as
  `add_friend_by_email`, looked up by referral code instead of email. Called
  from onboarding's optional "Got an invite code?" field once the new
  user's profile has been created.

Friend removal (`0006_remove_friend.sql`):

- `remove_friend(p_friend_id)` — deletes both directional `accepted` rows
  between the caller and the target. Triggered by a long-press on a
  leaderboard row.

Custom challenges (`0007_create_challenge.sql`):

- `create_challenge(p_title, p_goal_type, p_goal_value, p_duration_days)` —
  inserts a new `challenges` row and joins the caller as its first
  participant in one transaction (`challenges` has no client-facing insert
  policy, so this must go through the RPC rather than a direct table
  insert). Progress/status for the new challenge are picked up automatically
  by the existing `0002`/`0005` triggers and view — no extra wiring needed.

## Testing / verifying migrations

There is no automated test harness for the SQL in this repo (no CI step
applies migrations to a database). Before relying on a new or changed
migration:

1. Apply it to a scratch/dev Supabase project via the SQL editor or the
   Supabase CLI (`supabase db push`).
2. Exercise the RPC(s) it adds directly (SQL editor `select` / `perform`
   calls, or through the app) and confirm the expected rows/columns change.
3. Re-run the full migration sequence from `0001` on a fresh project
   periodically to catch ordering or idempotency regressions — see
   "Re-running" below.

## Migration convention

New schema changes go in a new numbered file under `migrations/` (e.g.
`0008_*.sql`) — never edit an already-shipped migration (`0001_init.sql`,
`0002_challenge_progress.sql`, ...) in place, so migration history stays
replayable against a project that already ran the earlier files.

## Re-running

All migration files and `seed.sql` are safe to run more than once
(`create table` isn't idempotent today — if you need to re-run the schema
from scratch, drop the tables first or use a fresh project).
