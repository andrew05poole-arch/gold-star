# StepLeague — Supabase Backend

Schema + RLS policies for the DailyStep MVP. Mirrors the data model and
algorithms documented in `../docs/PRD.md` §13.

## Set up a project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run every file in `migrations/` in numeric order
   (`0001_init.sql` through `0011_activity_reactions.sql` as of this writing —
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
| `profiles` | 1:1 with `auth.users`; display name, daily goal, stride/height for normalization, optional self-reported city/region/country (`0009_profile_location.sql`) for future geo leaderboards |
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

Activity feed foundation (issue #33, `0008_activity_events.sql`) — schema
and auto-logging only; reactions/comments/UI are separate follow-up issues:

- `activity_events` — `user_id`, `event_type` (`streak_milestone` |
  `challenge_completed` | `challenge_joined` | `friend_added`), `payload`
  jsonb, `created_at`. RLS only allows a user to select their own rows
  directly; friend-scoped reads go through the RPC below (same trade-off as
  `get_leaderboard`).
- `get_friend_activity_feed(p_user_id)` — caller + accepted friends' events,
  newest first, capped at 100 rows.
- Auto-logging triggers insert rows with no client involvement:
  - `trg_after_streak_update_log_milestone` on `streaks` — fires a
    `streak_milestone` event the moment `current_length` crosses 3, 7, or 30
    (not on every day past the threshold).
  - `trg_after_challenge_participant_progress_log_completion` on
    `challenge_participants` — fires a `challenge_completed` event when a
    `progress` write causes the `challenge_participant_status` (0005) logic
    to newly evaluate to `completed`. Since that status is otherwise only
    computed at read time off wall-clock date, a participant who already met
    their goal but stops syncing steps before the window closes won't get an
    event — an accepted gap for a feed, not a source of truth.
  - `trg_after_friendship_write_log_friend_added` on `friendships` — fires a
    `friend_added` event for a row's `user_id` whenever that row becomes
    `accepted` (covers both the flipped original row and the mirrored
    reverse row `respond_to_friend_request`, 0004, writes on acceptance).

Geo leaderboards (issue #31, `0010_geo_leaderboards.sql`) — public boards
alongside the friends-only `get_leaderboard`, same ranking pattern (this
ISO week's `normalized_score`, `previous_rank` from last week over the same
scope), each capped at `limit 100` since the candidate set isn't naturally
small like a friend list:

- `get_city_leaderboard(p_city)` — all users whose `profiles.city` matches
  case-insensitively.
- `get_country_leaderboard(p_country)` — same, scoped to `profiles.country`.
- `get_global_leaderboard()` — same, no scope filter (all users).

All three are `security definer` and viewable by any authenticated user
regardless of friendship — a public leaderboard, not a friend-scoped one —
but expose nothing beyond what `get_leaderboard` already surfaces across
users (`display_name`, `avatar_color`, `normalized_score`); city/country
themselves are read from `profiles`, already selectable by any
authenticated user (0001_init.sql).

Activity reactions / likes (issue #34, `0011_activity_reactions.sql`):

- `activity_reactions` — one row per `(event_id, user_id)` (primary key,
  so at most one "like" per user per event; no reaction-type enum). RLS
  only lets a user select/insert/delete their own reaction rows directly —
  same trade-off as `activity_events` (0008): no broad "friends can see
  reactions on events they can see" policy, since that would duplicate the
  friend-lookup logic `get_friend_activity_feed` already encapsulates.
- `toggle_activity_reaction(p_event_id)` — security-definer RPC that
  re-derives "can the caller see this event" using the exact same
  caller-or-accepted-friend rule as `get_friend_activity_feed`, then
  inserts the caller's reaction if absent or deletes it if present.
  Returns the resulting `(reacted, reaction_count)` for that event. Raises
  if the event doesn't exist or isn't visible to the caller.
- `get_activity_reaction_counts(p_event_ids)` — security-definer RPC
  returning `(event_id, reaction_count, reacted_by_me)` for a batch of
  event ids, so the Feed UI (issue #36) can render counts for a page of
  events in one call instead of one query per row. Does not re-check event
  visibility per id (only meaningful for ids the caller already got from
  `get_friend_activity_feed`); events with zero reactions are simply
  omitted from the result.

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
`0010_*.sql`) — never edit an already-shipped migration (`0001_init.sql`,
`0002_challenge_progress.sql`, ...) in place, so migration history stays
replayable against a project that already ran the earlier files.

## Re-running

All migration files and `seed.sql` are safe to run more than once
(`create table` isn't idempotent today — if you need to re-run the schema
from scratch, drop the tables first or use a fresh project).
