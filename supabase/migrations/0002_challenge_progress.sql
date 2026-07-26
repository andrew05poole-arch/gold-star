-- Compute challenge_participants.progress from step_records (issue #4).
--
-- `challenge_participants.progress` was previously set once at join time
-- (always 0) and never updated, so challenge progress bars never moved.
-- This migration adds a function that recomputes progress for every active
-- participation of a user, and wires it into the same step_records trigger
-- pattern used by `recompute_streak` in 0001_init.sql (fired after every
-- insert/update of `raw_steps`).
--
-- Progress formula per `challenges.goal_type`, evaluated over the
-- participant's own window [joined_at::date, joined_at::date + duration_days
-- - 1] (a join-anchored window, since `challenges` has no per-participant
-- end date and participants can join at different times):
--
--   * stepsPerDay — progress is today's normalized_steps (raw, not clamped
--     to goal_value; the UI already clamps `progress / goal_value` to 1 when
--     rendering, see app-mobile/lib/api/challenges.ts). This reflects "how
--     you're doing today" rather than a fraction, matching the existing
--     `progress` column semantics (a raw quantity compared against
--     goal_value on read).
--   * totalSteps — sum of normalized_steps across the whole window, so
--     progress accumulates day over day toward goal_value.
--   * daysStreak — count of qualifying days within the window, where a day
--     qualifies if its normalized_steps meet the challenge's own goal_value
--     (not the 60%-of-daily-goal floor used by the personal streak in
--     `recompute_streak` — that floor is specific to the user's personal
--     `daily_goal`/streak feature, whereas a daysStreak challenge defines
--     its own explicit per-day target via `goal_value`, so reusing the
--     challenge's own value is the more natural, self-contained definition).
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
    select cp.challenge_id, cp.joined_at, c.goal_type, c.goal_value, c.duration_days
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = p_user_id
  loop
    v_window_start := v_participation.joined_at::date;
    v_window_end := v_window_start + (v_participation.duration_days - 1);

    if v_participation.goal_type = 'stepsPerDay' then
      select coalesce(normalized_steps, 0) into v_progress
      from public.step_records
      where user_id = p_user_id and date = least(current_date, v_window_end);

      v_progress := coalesce(v_progress, 0);

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

create or replace function public.trg_step_record_recompute_challenge_progress()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_challenge_progress(new.user_id);
  return new;
end;
$$;

create trigger trg_after_step_record_upsert_challenge_progress
  after insert or update of raw_steps on public.step_records
  for each row execute function public.trg_step_record_recompute_challenge_progress();

-- Backfill: recompute progress for everyone who already has a participation
-- row, so existing joins pick up real numbers immediately after this
-- migration runs (rather than waiting for their next step_records write).
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select distinct user_id from public.challenge_participants loop
    perform public.recompute_challenge_progress(v_user_id);
  end loop;
end;
$$;
