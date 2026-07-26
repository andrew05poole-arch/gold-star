-- Add UI-driven custom challenge creation (issue #13, P2 — a nice-to-have
-- beyond the PRD §8 MVP scope, since presets already cover "simple
-- challenges", but it's the last open backlog item).
--
-- `public.challenges` has a select-only RLS policy (0001_init.sql) — there
-- is no insert policy, so a plain client-side `supabase.from('challenges')
-- .insert(...)` would be rejected outright. Rather than opening up a broad
-- "any authenticated user can insert" policy on `challenges` (which would
-- also require a second insert into `challenge_participants` as a separate,
-- non-atomic client round trip), this migration adds a single
-- `security definer` RPC that does both inserts — the new challenge row and
-- the creator's own participation row — in one transaction, scoped to
-- `auth.uid()`. This mirrors the existing RPC pattern used throughout the
-- schema (`add_friend_by_email`, `remove_friend`, `respond_to_friend_request`)
-- rather than introducing a new, differently-shaped convention.
create or replace function public.create_challenge(
  p_title text,
  p_goal_type text,
  p_goal_value numeric,
  p_duration_days integer
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

  insert into public.challenges (title, goal_type, goal_value, duration_days, created_by)
    values (trim(p_title), p_goal_type, p_goal_value, p_duration_days, v_self)
    returning id into v_challenge_id;

  insert into public.challenge_participants (challenge_id, user_id, progress)
    values (v_challenge_id, v_self, 0);

  return v_challenge_id;
end;
$$;

grant execute on function public.create_challenge(text, text, numeric, integer) to authenticated;
