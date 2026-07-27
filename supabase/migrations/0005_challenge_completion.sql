-- Challenge completion/expiry logic (issue #10).
--
-- `challenge_participants.progress` (0002_challenge_progress.sql) is kept
-- live by a trigger on `step_records`, but nothing ever marks a
-- participation as done: once a participant's window
-- [joined_at::date, joined_at::date + duration_days - 1] closes, the row
-- just sits there with a frozen `progress` value and the client always
-- rendered it as "active".
--
-- Design choice: expose status via a VIEW rather than a persisted column
-- updated by the existing step_records trigger. A persisted-column
-- approach (bumping status alongside `progress` in
-- `recompute_challenge_progress`) would only ever be recomputed when the
-- user's steps change — so a participant who stops syncing steps the day
-- their window closes would stay stuck on `active` forever, which is
-- exactly the bug this issue is about. Status depends on wall-clock time
-- (`current_date` vs. the window), not just on step data, so it needs to
-- be evaluated at *read* time. A view (like the existing
-- `leaderboard_week_scores` view from 0001_init.sql) gives us that for
-- free with no extra trigger plumbing, and stays trivially in sync with
-- `challenge_participants.progress`.
--
-- Status is derived per-row from progress vs. goal_value once the window
-- has closed:
--   * active    — window still open (current_date <= window_end).
--   * completed — window closed and progress >= goal_value. Per the
--     progress semantics documented in 0002 (stepsPerDay = final day's
--     steps, totalSteps = cumulative sum, daysStreak = qualifying day
--     count), "progress >= goal_value" is the correct "met the goal" test
--     for all three goal_types uniformly.
--   * expired   — window closed and progress < goal_value.
create or replace view public.challenge_participant_status as
select
  cp.challenge_id,
  cp.user_id,
  cp.progress,
  cp.joined_at,
  c.goal_type,
  c.goal_value,
  c.duration_days,
  (cp.joined_at::date + (c.duration_days - 1)) as window_end,
  case
    when current_date <= (cp.joined_at::date + (c.duration_days - 1)) then 'active'
    when cp.progress >= c.goal_value then 'completed'
    else 'expired'
  end as status
from public.challenge_participants cp
join public.challenges c on c.id = cp.challenge_id;

-- Views run with the privileges of their owner by default; opt into
-- security_invoker so the view is subject to the querying user's RLS
-- policies on the underlying tables (both of which already allow read
-- access to any authenticated user, matching the base tables' intent).
alter view public.challenge_participant_status set (security_invoker = true);

grant select on public.challenge_participant_status to authenticated;
