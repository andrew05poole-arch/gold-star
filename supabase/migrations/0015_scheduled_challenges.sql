-- Scheduled / "queued" challenges (follow-up to the challenge detail screen,
-- 0014_challenge_detail.sql).
--
-- `public.challenges.starts_at` (0001_init.sql) has existed since day one but
-- was never actually used — every window was purely `joined_at`-anchored
-- (0002_challenge_progress.sql), which is exactly right for "join any time,
-- get your own fair full-length window" instant challenges, but gives no way
-- to say "this challenge starts Saturday, everyone races over the same
-- window." This migration puts `starts_at` to work rather than adding a new
-- column/table for it.
--
-- Window formula, everywhere it's computed: `greatest(joined_at::date,
-- starts_at)`. For a normal instant challenge (`starts_at` defaults to
-- creation day), anyone joining today or later already has
-- `joined_at::date >= starts_at`, so this collapses to exactly today's
-- existing behavior — zero regression for existing challenges. For a
-- SCHEDULED challenge (`starts_at` in the future), an early joiner's window
-- starts on the shared `starts_at` instead of their own (earlier) join
-- time — everyone who joins before the start races together from the same
-- moment. A joiner who arrives after `starts_at` still gets `joined_at` as
-- their window start, same late-joiner behavior as today.
--
-- Join lockout is IMPLICIT (product decision, not a separate "join by"
-- column): once a challenge's shared window has fully closed
-- (`current_date > starts_at + duration_days - 1`), it stops being
-- joinable, full stop. This is a genuine behavior change for EVERY
-- challenge, not just scheduled ones — today a challenge is joinable
-- forever and a late joiner just gets a fresh personal window. Accepted
-- tradeoff of the chosen design; supabase/seed.sql is updated in this same
-- migration set so its two dev presets don't go permanently stale from it.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0014_challenge_detail.sql.

-- ---------------------------------------------------------------------------
-- 1. recompute_challenge_progress — window-start formula + stepsPerDay fix.
--    Signature unchanged (still just p_user_id), so a plain
--    `create or replace function` correctly replaces the existing one.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_challenge_progress(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participation record;
  v_window_start date;
  v_window_end date;
  v_progress numeric;
begin
  for v_participation in
    select cp.challenge_id, cp.joined_at, c.goal_type, c.goal_value, c.duration_days, c.starts_at
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = p_user_id
  loop
    v_window_start := greatest(v_participation.joined_at::date, v_participation.starts_at);
    v_window_end := v_window_start + (v_participation.duration_days - 1);

    if v_participation.goal_type = 'stepsPerDay' then
      -- Fix: previously unbounded below, so a participant who joined a
      -- scheduled challenge before its shared start could see a nonzero
      -- "today's progress" before their window had even opened.
      if current_date < v_window_start then
        v_progress := 0;
      else
        select coalesce(normalized_steps, 0) into v_progress
        from public.step_records
        where user_id = p_user_id and date = least(current_date, v_window_end);

        v_progress := coalesce(v_progress, 0);
      end if;

    elsif v_participation.goal_type = 'totalSteps' then
      select coalesce(sum(normalized_steps), 0) into v_progress
      from public.step_records
      where user_id = p_user_id
        and date between v_window_start and v_window_end;

    elsif v_participation.goal_type = 'daysStreak' then
      select coalesce(count(*), 0) into v_progress
      from public.step_records
      where user_id = p_user_id
        and date between v_window_start and v_window_end
        and normalized_steps >= v_participation.goal_value;

    else
      v_progress := 0;
    end if;

    update public.challenge_participants
      set progress = v_progress
      where challenge_id = v_participation.challenge_id
        and user_id = p_user_id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. challenge_participant_status — add window_start, add 'upcoming' status.
--    Dropped and recreated rather than `create or replace view`: inserting
--    a new column ahead of `window_end` (for readable ordering) would
--    violate Postgres's append-only-column rule for view replacement.
--    Nothing else in the schema depends on this view's structure (only
--    read by client-side Supabase queries using named column access), so a
--    drop+recreate is safe.
-- ---------------------------------------------------------------------------
drop view if exists public.challenge_participant_status;

create view public.challenge_participant_status as
select
  cp.challenge_id,
  cp.user_id,
  cp.progress,
  cp.joined_at,
  c.goal_type,
  c.goal_value,
  c.duration_days,
  w.window_start,
  (w.window_start + (c.duration_days - 1)) as window_end,
  case
    when current_date < w.window_start then 'upcoming'
    when current_date <= (w.window_start + (c.duration_days - 1)) then 'active'
    when cp.progress >= c.goal_value then 'completed'
    else 'expired'
  end as status
from public.challenge_participants cp
join public.challenges c on c.id = cp.challenge_id
-- Computed once via a lateral join, not repeated inline, so window_start
-- and window_end can never diverge from each other or from the status case.
cross join lateral (select greatest(cp.joined_at::date, c.starts_at) as window_start) w;

alter view public.challenge_participant_status set (security_invoker = true);

grant select on public.challenge_participant_status to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Join lockout — no precedent in this repo for editing an existing RLS
--    policy (there's no `create or replace policy` in Postgres), so drop
--    then recreate both the insert ("join") and update ("re-join via
--    upsert onConflict") policies with the same window-closed check. The
--    update policy needed it too: joinChallenge()'s upsert
--    (app-mobile/lib/api/challenges.ts) would otherwise route a same-user
--    re-join through this unrestricted UPDATE path once the row exists,
--    silently bypassing the lockout and resetting progress to 0.
-- ---------------------------------------------------------------------------
drop policy if exists "users join challenges as themselves" on public.challenge_participants;

create policy "users join challenges as themselves"
  on public.challenge_participants for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and current_date <= (c.starts_at + c.duration_days - 1)
    )
  );

drop policy if exists "users update their own challenge progress" on public.challenge_participants;

create policy "users update their own challenge progress"
  on public.challenge_participants for update
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and current_date <= (c.starts_at + c.duration_days - 1)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. create_challenge — add p_starts_at. Postgres identifies functions by
--    name + parameter TYPE LIST, so appending a new parameter changes the
--    signature and `create or replace function` would just add a second
--    overload alongside the old 4-argument one rather than replacing it —
--    the old function must be dropped explicitly first.
-- ---------------------------------------------------------------------------
drop function if exists public.create_challenge(text, text, numeric, integer);

create or replace function public.create_challenge(
  p_title text,
  p_goal_type text,
  p_goal_value numeric,
  p_duration_days integer,
  p_starts_at date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_challenge_id uuid;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  if p_goal_type not in ('stepsPerDay', 'totalSteps', 'daysStreak') then
    raise exception 'Invalid goal type';
  end if;

  if p_goal_value is null or p_goal_value <= 0 then
    raise exception 'Goal value must be greater than zero';
  end if;

  if p_duration_days is null or p_duration_days <= 0 then
    raise exception 'Duration must be at least 1 day';
  end if;

  if p_starts_at is null or p_starts_at < current_date then
    raise exception 'Start date can''t be in the past';
  end if;

  insert into public.challenges (title, goal_type, goal_value, duration_days, created_by, starts_at)
    values (trim(p_title), p_goal_type, p_goal_value, p_duration_days, v_self, p_starts_at)
    returning id into v_challenge_id;

  insert into public.challenge_participants (challenge_id, user_id, progress)
    values (v_challenge_id, v_self, 0);

  return v_challenge_id;
end;
$$;

grant execute on function public.create_challenge(text, text, numeric, integer, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. No backfill needed: every existing challenge_participants row has
--    joined_at::date >= starts_at (you can't join a challenge before its
--    row exists, and starts_at always defaulted to creation day until this
--    migration), so greatest(...) collapses to today's exact existing
--    value for all current data.
-- ---------------------------------------------------------------------------
