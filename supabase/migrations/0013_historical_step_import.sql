-- Historical step import during onboarding.
--
-- New users onboarding with a real Health provider connected can bulk-import
-- recent daily totals (7/30/90 days) so their first-run experience is
-- personalized instead of an empty dashboard (see docs/PRD.md §9.1, extended
-- here beyond the current wireframe — see app-mobile/lib/historicalStepImport.ts
-- for the client-side orchestration).
--
-- Competition-integrity requirement: imported history must never retroactively
-- change a live or completed standing. Concretely in this schema, that means
-- the WEEKLY LEADERBOARD (`leaderboard_week_scores`, read by `get_leaderboard`)
-- must not sum imported rows into the current/previous week's score — a brand
-- new user importing 30 days of history could otherwise inflate this week's
-- leaderboard score with steps taken before they even had an account. Two
-- other aggregate surfaces do NOT need a guard here, on inspection:
--   - `challenge_participants` progress (0002_challenge_progress.sql) is
--     already windowed to [joined_at::date, joined_at::date + duration_days-1]
--     per participant, which only extends forward from the moment they joined
--     — a historical date (always < joined_at, since import happens as part
--     of onboarding before any challenge exists to join) can never fall
--     inside that window, so it's structurally excluded already.
--   - `recompute_streak()` (0001_init.sql:110-163) only ever evaluates
--     `current_date`'s row regardless of which row's write triggered it, so a
--     bulk import of past-dated rows cannot alter `current_length`/
--     `longest_length` through that trigger either way (a pre-existing
--     property of that function, not something this migration changes).
-- `get_rival_target`'s trailing-7-day average is deliberately NOT guarded —
-- unlike the leaderboard, the AI Rival isn't a shared/competitive standing,
-- and using imported history to set a fair personal target is exactly the
-- kind of personalization this feature is meant to enable.
--
-- Post-MVP note (0010_geo_leaderboards.sql): the City/Country/Global scope
-- RPCs added there all read scores through this same `leaderboard_week_scores`
-- view rather than redefining it — so this migration's exclusion filter
-- protects every leaderboard scope, not just the friends one, with no extra
-- code needed there.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0012_activity_comments.sql.

-- ---------------------------------------------------------------------------
-- Provenance columns. `is_historical_import` is the single source of truth
-- for "did this row arrive via bulk onboarding import, or via a live
-- day-of upsert (mock/real sensor)?" — every scoring surface that must
-- exclude imported data filters on this column; there is intentionally no
-- second "is_competition_eligible" column to keep the rule in one place.
-- `imported_at` is provenance-only (troubleshooting/audit), not read by any
-- scoring logic.
-- ---------------------------------------------------------------------------
alter table public.step_records
  add column is_historical_import boolean not null default false,
  add column imported_at timestamptz;

comment on column public.step_records.is_historical_import is
  'True for rows written by the onboarding historical-import flow rather than a live day-of upsert. Excluded from leaderboard_week_scores — see this migration''s header comment.';

-- ---------------------------------------------------------------------------
-- Re-declare leaderboard_week_scores to exclude historical-import rows. This
-- is the single centralized enforcement point: get_leaderboard (0001_init.sql,
-- re-declared unchanged in 0004_friend_requests.sql) only ever reads scores
-- through this view, so filtering here cannot be bypassed by another query
-- path or by a client forgetting to filter client-side.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_week_scores as
select
  user_id,
  date_trunc('week', date::timestamp at time zone 'UTC')::date as week_id,
  sum(normalized_steps) as normalized_score
from public.step_records
where not is_historical_import
group by user_id, date_trunc('week', date::timestamp at time zone 'UTC');
