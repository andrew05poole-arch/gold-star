# StepLeague — Supabase Backend

Schema + RLS policies for the DailyStep MVP. Mirrors the data model and
algorithms documented in `../docs/PRD.md` §13.

## Set up a project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migrations in `migrations/` in numeric order
   (`0001_init.sql`, then `0002_challenge_progress.sql`, ...) — creates
   tables, triggers, RPCs, RLS policies. Then optionally run `seed.sql`
   (adds two joinable challenge presets matching the prototype).
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
| `friendships` | Symmetric accepted-friend rows, created via `add_friend_by_email` |
| `challenges` / `challenge_participants` | Joinable challenge presets + per-user progress |
| `rival_profiles` | Per-user AI rival config (name, difficulty band) |

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

## Migration convention

New schema changes go in a new numbered file under `migrations/` (e.g.
`0003_*.sql`) — never edit an already-shipped migration (`0001_init.sql`,
`0002_challenge_progress.sql`, ...) in place, so migration history stays
replayable against a project that already ran the earlier files.

## Re-running

`0001_init.sql`, `0002_challenge_progress.sql`, and `seed.sql` are safe to
run more than once (`create table` isn't idempotent today — if you need to
re-run the schema from scratch, drop the tables first or use a fresh
project).
