-- Challenge detail screen: creator edit/delete (issue: challenge detail
-- follow-up to 0007_create_challenge.sql).
--
-- `public.challenges` only ever got a select policy (0001_init.sql) — insert
-- goes through the `create_challenge` RPC (0007), and until now there was no
-- way to change or remove a challenge at all once created. This migration
-- adds two owner-scoped `security definer` RPCs, the same shape as
-- `create_challenge`, rather than opening up update/delete RLS policies on
-- `challenges` directly.
--
-- Scope choice: `update_challenge` only touches `title`/`subtitle`. It
-- deliberately does NOT allow editing `goal_type`, `goal_value`, or
-- `duration_days` — those feed directly into
-- `challenge_participant_status`'s per-participant `window_end` and
-- `status` calculation (0005_challenge_completion.sql), computed live at
-- read time from `challenge_participants.joined_at` + `challenges.
-- duration_days`. Letting a creator change the goal/duration after other
-- people have already joined would retroactively change every existing
-- participant's target and window out from under them — a fairness
-- footgun best left for a later, more deliberate design (e.g. only
-- allowed before anyone else has joined) rather than shipped implicitly
-- here.
--
-- `delete_challenge` deletes the challenge outright; `challenge_participants`
-- rows cascade via the existing `on delete cascade` FK (0001_init.sql). No
-- confirmation/warning to other participants is sent — acceptable for a
-- creator deleting their own challenge in this MVP-scale feature; flagged
-- here rather than silently assumed away.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0013_historical_step_import.sql.

create or replace function public.update_challenge(
  p_challenge_id uuid,
  p_title text,
  p_subtitle text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_owner uuid;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  select created_by into v_owner from public.challenges where id = p_challenge_id;

  if v_owner is null then
    raise exception 'Challenge not found';
  end if;

  if v_owner <> v_self then
    raise exception 'Only the challenge creator can edit it';
  end if;

  update public.challenges
    set title = trim(p_title),
        subtitle = nullif(trim(coalesce(p_subtitle, '')), '')
    where id = p_challenge_id;
end;
$$;

grant execute on function public.update_challenge(uuid, text, text) to authenticated;

create or replace function public.delete_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_owner uuid;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  select created_by into v_owner from public.challenges where id = p_challenge_id;

  if v_owner is null then
    raise exception 'Challenge not found';
  end if;

  if v_owner <> v_self then
    raise exception 'Only the challenge creator can delete it';
  end if;

  delete from public.challenges where id = p_challenge_id;
end;
$$;

grant execute on function public.delete_challenge(uuid) to authenticated;
