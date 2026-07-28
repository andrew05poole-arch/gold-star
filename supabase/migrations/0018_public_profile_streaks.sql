-- Public profile pages (issue: "view others' profiles and see their
-- history of steps, streaks, associated leagues").
--
-- `streaks` (0001_init.sql) has only ever had an own-row-only SELECT
-- policy. Every other piece of data a public profile page needs is already
-- open to any authenticated user: `profiles` (select using (true)),
-- `challenge_participant_status` (readable by any authenticated user, per
-- both the underlying `challenges` and `challenge_participants` select
-- policies). Streak length isn't more sensitive than the weekly
-- normalized_score the geo leaderboards (0010_geo_leaderboards.sql)
-- already broadcast to every authenticated user regardless of friendship —
-- relaxing this one policy to match that existing openness is simpler and
-- more consistent than adding a new security-definer RPC just to read a
-- single row with no computation involved.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0017_avatar_url_everywhere.sql.

drop policy if exists "users read their own streak" on public.streaks;

create policy "streaks are readable by any authenticated user"
  on public.streaks for select
  to authenticated
  using (true);
