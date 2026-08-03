-- Challenge placement (permanent gold/silver/bronze medals), a virtual
-- points ledger, and World Rank — the free, Strava-style competitive/social
-- layer from the monetization research pass. Points/medals are earned
-- through real activity only; nothing here is purchasable, and nothing
-- gates participation — see this migration's own header reasoning below
-- for why that line is permanent, not just a v1 limitation.
--
-- An independent design-review pass caught four real issues before this was
-- written, all closed below:
--   1. Race condition — naive check-then-insert finalization could double-
--      award points/events under concurrent calls. Closed with
--      pg_advisory_xact_lock inside finalize_challenge_placements.
--   2. Wrong trust boundary — finalizing as a side effect of a GET
--      (getChallengeDetail) would let a passive, uninvolved viewer of a
--      public challenge trigger writes/point-awards for OTHER users who
--      never made a request. Closed by hooking finalization into
--      trg_challenge_participants_log_completion instead (0008, already
--      touched once in 0023) — a WRITE, fired by an active participant's
--      own step sync (via recompute_challenge_progress in
--      0002_challenge_progress.sql), matching this codebase's only
--      established "compute once" idiom.
--   3. Coverage gap — no cron exists (confirmed, none anywhere in this
--      repo), and a challenge nobody ever syncs steps against again after
--      it closes will never finalize under this design. Accepted as a
--      named v1 gap, not silently glossed over — pg_cron calling this same
--      idempotent function periodically is the deliberate v2 answer once
--      that infrastructure exists.
--   4. Zero-effort medals — ranking purely by relative progress would let a
--      solo or two-person challenge mint an unearned gold medal. Closed
--      with an explicit eligibility gate: medals require >=3 participants
--      AND progress > 0 for the specific recipient.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0025_fix_challenges_participants_mutual_recursion.sql.

-- ---------------------------------------------------------------------------
-- 1. challenge_placements — a permanent rank for every participant, stored
--    once a challenge closes for everyone (see finalize_challenge_placements
--    below for exactly when that is). Stored for ALL participants, not just
--    medalists, so "competed in N challenges" stays accurate; `medal` is
--    true only when the eligibility gate passes for that specific row.
-- ---------------------------------------------------------------------------
create table public.challenge_placements (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  placement integer not null,
  progress numeric not null,
  medal boolean not null,
  finalized_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.challenge_placements enable row level security;

-- Same visibility as the challenge itself — reuses can_view_challenge /
-- is_fellow_participant (0024/0025), the recursion-safe helpers already
-- proven correct for challenges/challenge_participants. This is a leaf
-- dependency on already-fixed infrastructure, not a new cycle: neither
-- helper queries challenge_placements.
create policy "placements are readable by any authenticated user who can see the challenge"
  on public.challenge_placements for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.can_view_challenge(challenge_id)
    or public.is_fellow_participant(challenge_id)
  );

-- ---------------------------------------------------------------------------
-- 2. points_transactions — an append-only ledger, not a mutable counter, so
--    "how did I earn these" stays auditable and this is the right
--    foundation if a real-money cosmetic shop ever needs to reconcile spend
--    against earn history (see the monetization research: nothing here
--    should ever gate capability, only later purchase cosmetics).
-- ---------------------------------------------------------------------------
create table public.points_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('challenge_completed', 'challenge_placement', 'streak_milestone')),
  challenge_id uuid references public.challenges (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.points_transactions enable row level security;

create policy "users read their own points transactions"
  on public.points_transactions for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Extend activity_events to allow 'challenge_placement' — same
--    drop+recreate mechanism as 0023 (text + check, not a native enum).
-- ---------------------------------------------------------------------------
alter table public.activity_events drop constraint if exists activity_events_event_type_check;

alter table public.activity_events add constraint activity_events_event_type_check
  check (event_type in ('streak_milestone', 'challenge_completed', 'challenge_joined', 'friend_added', 'reshare', 'challenge_placement'));

-- ---------------------------------------------------------------------------
-- 4. finalize_challenge_placements — the core function. Idempotent (no-ops
--    if already finalized or not yet closed for everyone), lock-guarded
--    against concurrent callers, purely internal (called only from the
--    trigger below, never exposed to the client) — matches
--    challenge_window_open / can_view_challenge / is_fellow_participant in
--    having no explicit grant to `authenticated`.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_challenge_placements(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_count integer;
begin
  -- Serializes concurrent calls for the same challenge (e.g. two
  -- participants both syncing steps right as their windows close): the
  -- second caller blocks here until the first transaction commits, then
  -- its own "already finalized?" check below correctly no-ops.
  perform pg_advisory_xact_lock(hashtext(p_challenge_id::text));

  -- "Closed for everyone" — not challenge_window_open(), which only gates
  -- new joins and is anchored to the challenge's own starts_at. A
  -- participant who joined after starts_at has their own later window
  -- (challenge_participant_status.window_end, join-anchored per
  -- 0015_scheduled_challenges.sql), so the correct "is it truly over" check
  -- is that no participant's own derived status is still upcoming/active.
  if exists (
    select 1 from public.challenge_participant_status
    where challenge_id = p_challenge_id and status in ('upcoming', 'active')
  ) then
    return;
  end if;

  if exists (select 1 from public.challenge_placements where challenge_id = p_challenge_id) then
    return;
  end if;

  select count(*) into v_participant_count
    from public.challenge_participants
    where challenge_id = p_challenge_id;

  with ranked as (
    select
      cp.user_id,
      cp.progress,
      row_number() over (order by cp.progress desc, cp.joined_at asc, cp.user_id asc) as rnk
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
  )
  insert into public.challenge_placements (challenge_id, user_id, placement, progress, medal)
    select
      p_challenge_id,
      r.user_id,
      r.rnk::int,
      r.progress,
      (r.rnk <= 3 and v_participant_count >= 3 and r.progress > 0)
    from ranked r;

  insert into public.activity_events (user_id, event_type, payload)
    select
      cpl.user_id,
      'challenge_placement',
      jsonb_build_object('challenge_id', p_challenge_id, 'challenge_title', c.title, 'placement', cpl.placement)
    from public.challenge_placements cpl
    join public.challenges c on c.id = cpl.challenge_id
    where cpl.challenge_id = p_challenge_id and cpl.medal;

  insert into public.points_transactions (user_id, amount, reason, challenge_id)
    select
      cpl.user_id,
      case cpl.placement when 1 then 50 when 2 then 30 when 3 then 20 end,
      'challenge_placement',
      p_challenge_id
    from public.challenge_placements cpl
    where cpl.challenge_id = p_challenge_id and cpl.medal;

  insert into public.points_transactions (user_id, amount, reason, challenge_id)
    select cps.user_id, 10, 'challenge_completed', p_challenge_id
    from public.challenge_participant_status cps
    where cps.challenge_id = p_challenge_id and cps.status = 'completed';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Points/rank read RPCs — same "aggregate is public, raw ledger rows are
--    not" pattern as get_friend_count (0022): points_transactions' own
--    SELECT policy is own-row-only, so a stranger's total/rank needs a
--    security-definer RPC to compute without exposing individual rows.
-- ---------------------------------------------------------------------------
create or replace function public.get_total_points(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int from public.points_transactions where user_id = p_user_id;
$$;

grant execute on function public.get_total_points(uuid) to authenticated;

-- Returns null for a user with zero points_transactions rows (never earned
-- any) rather than a fabricated last-place number — the client shows
-- "Unranked" for null instead.
create or replace function public.get_world_rank(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select user_id, sum(amount) as total
    from public.points_transactions
    group by user_id
  ),
  ranked as (
    select user_id, rank() over (order by total desc) as rnk
    from totals
  )
  select rnk::int from ranked where user_id = p_user_id;
$$;

grant execute on function public.get_world_rank(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. trg_challenge_participants_log_completion — body-only edit (already
--    touched once in 0023 to add challenge_id to its payload): now also
--    calls finalize_challenge_placements unconditionally after its existing
--    completion-logging logic. Safe to call unconditionally because the
--    function's own internal guards (not closed yet / already finalized)
--    make repeated calls a cheap no-op the vast majority of the time — no
--    separate "did it just close" check is needed at this call site.
-- ---------------------------------------------------------------------------
create or replace function public.trg_challenge_participants_log_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge record;
  v_window_end date;
  v_old_status text;
  v_new_status text;
begin
  select title, goal_value, duration_days into v_challenge
    from public.challenges where id = new.challenge_id;

  v_window_end := new.joined_at::date + (v_challenge.duration_days - 1);

  v_old_status := case
    when current_date <= v_window_end then 'active'
    when old.progress >= v_challenge.goal_value then 'completed'
    else 'expired'
  end;

  v_new_status := case
    when current_date <= v_window_end then 'active'
    when new.progress >= v_challenge.goal_value then 'completed'
    else 'expired'
  end;

  if v_new_status = 'completed' and v_old_status <> 'completed' then
    insert into public.activity_events (user_id, event_type, payload)
      values (
        new.user_id,
        'challenge_completed',
        jsonb_build_object('challenge_title', v_challenge.title, 'challenge_id', new.challenge_id)
      );
  end if;

  perform public.finalize_challenge_placements(new.challenge_id);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. trg_streaks_log_milestone — body-only edit (0008): now also awards
--    points alongside the existing activity-event insert.
-- ---------------------------------------------------------------------------
create or replace function public.trg_streaks_log_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_milestone integer;
  v_points integer;
begin
  foreach v_milestone in array array[3, 7, 30] loop
    if old.current_length < v_milestone and new.current_length >= v_milestone then
      insert into public.activity_events (user_id, event_type, payload)
        values (
          new.user_id,
          'streak_milestone',
          jsonb_build_object('streak_length', new.current_length)
        );

      v_points := case v_milestone when 3 then 5 when 7 then 15 when 30 then 30 end;
      insert into public.points_transactions (user_id, amount, reason)
        values (new.user_id, v_points, 'streak_milestone');
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. toggle_reshare — body-only edit (0023): 'challenge_placement' joins
--    the reshareable-type allowlist ("share where you dominated"), and the
--    existing invite-only-challenge gate (already applied to
--    challenge_completed/challenge_joined) covers it for free, since its
--    payload carries challenge_id in the same shape.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_reshare(p_event_id uuid)
returns table (
  reshared boolean,
  reshared_event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_event_type text;
  v_payload jsonb;
  v_created_at timestamptz;
  v_owner_name text;
  v_owner_color text;
  v_owner_avatar text;
  v_visible boolean;
  v_challenge_id uuid;
  v_challenge_visibility text;
  v_existing_reshare_id uuid;
  v_new_event_id uuid;
begin
  if v_caller is null then
    raise exception 'Not signed in';
  end if;

  select user_id, event_type, payload, created_at
    into v_owner, v_event_type, v_payload, v_created_at
    from public.activity_events where id = p_event_id;

  if v_owner is null then
    raise exception 'activity event % not found', p_event_id;
  end if;

  if v_event_type not in ('streak_milestone', 'challenge_completed', 'challenge_joined', 'challenge_placement') then
    raise exception 'This kind of activity can''t be reshared';
  end if;

  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((user_id = v_caller and friend_id = v_owner) or (friend_id = v_caller and user_id = v_owner))
  ) or v_owner = v_caller
    into v_visible;

  if not v_visible then
    raise exception 'activity event % is not visible to the caller', p_event_id;
  end if;

  if v_event_type in ('challenge_completed', 'challenge_joined', 'challenge_placement') then
    v_challenge_id := (v_payload->>'challenge_id')::uuid;
    if v_challenge_id is not null then
      select visibility into v_challenge_visibility from public.challenges where id = v_challenge_id;
      if v_challenge_visibility = 'invite_only' then
        raise exception 'This challenge is invite-only and can''t be reshared';
      end if;
    end if;
  end if;

  select reshared_event_id into v_existing_reshare_id
    from public.activity_reshares
    where original_event_id = p_event_id and resharer_id = v_caller;

  if v_existing_reshare_id is not null then
    delete from public.activity_reshares
      where original_event_id = p_event_id and resharer_id = v_caller;
    return query select false, null::uuid;
  else
    select display_name, avatar_color, avatar_url
      into v_owner_name, v_owner_color, v_owner_avatar
      from public.profiles where id = v_owner;

    insert into public.activity_events (user_id, event_type, payload)
      values (
        v_caller,
        'reshare',
        jsonb_build_object(
          'original_event_id', p_event_id,
          'original_user_id', v_owner,
          'original_display_name', v_owner_name,
          'original_avatar_color', v_owner_color,
          'original_avatar_url', v_owner_avatar,
          'original_event_type', v_event_type,
          'original_payload', v_payload,
          'original_created_at', v_created_at
        )
      )
      returning id into v_new_event_id;

    insert into public.activity_reshares (original_event_id, resharer_id, reshared_event_id)
      values (p_event_id, v_caller, v_new_event_id);

    return query select true, v_new_event_id;
  end if;
end;
$$;

grant execute on function public.toggle_reshare(uuid) to authenticated;
