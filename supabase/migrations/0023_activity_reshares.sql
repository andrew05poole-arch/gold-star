-- Reshare (repost): rebroadcast a friend's feed item to your own feed, so it
-- reaches your own friends too, one hop past the original poster's friend
-- circle. Copy-model, not pointer-model: a reshare snapshots the original
-- event's content into a NEW activity_events row owned by the resharer, so
-- get_friend_activity_feed's existing "owner is caller-or-accepted-friend"
-- visibility rule needs zero changes — the resharer's friends only ever read
-- the resharer's OWN row, never needing access to the original poster's row
-- directly. This also means reacting/commenting on a reshare works with no
-- changes to toggle_activity_reaction / activity comments, since both only
-- ever check the row's own `user_id`.
--
-- Two real issues were caught by an independent design-review pass before
-- this was written, both closed below rather than left as follow-ups:
--
--   1. Snapshotting a 'friend_added' event's payload verbatim would leak a
--      third party's identity (the `friend_id` of the OTHER side of that
--      friendship, per trg_friendships_log_friend_added in
--      0008_activity_events.sql) to the resharer's friends — people who have
--      no relationship to either party and never passed any visibility
--      check against them. Closed via an ALLOWLIST, not a blocklist: only
--      'streak_milestone', 'challenge_completed', 'challenge_joined' are
--      reshareable in toggle_reshare below. Any future event type is
--      excluded by default until deliberately reviewed against this same
--      question. This also blocks reshare-of-a-reshare for free, since
--      'reshare' itself isn't in the allowlist.
--
--   2. Reshared challenge events could leak an invite-only challenge's title
--      one hop further than the already-narrow existing gap (a friend of a
--      participant can already see the title in their own feed even without
--      being invited — see challenges' SELECT policy, 0020_challenge_
--      visibility_invites.sql — reshare would extend that visibility to
--      friends-of-friends). Closed by rejecting reshare of a
--      challenge_completed/challenge_joined event whose linked challenge is
--      invite_only — which is also simply correct product behavior, since
--      "share so anyone can join" only makes sense for a public challenge.
--
-- A third finding — deleting the ORIGINAL event would orphan any reshare of
-- it, since activity_reshares' cascade only runs in the mapping-row
-- direction, not onward to the activity_events row it points to — is closed
-- by trg_after_activity_reshare_delete_cascade below. No feature deletes an
-- activity_events row today, but the schema should be correct regardless;
-- retrofitting this after a delete-my-post/delete-my-account feature ships
-- would be much more awkward.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0022_friend_request_from_profile.sql.

-- ---------------------------------------------------------------------------
-- 1. Extend activity_events.event_type to allow 'reshare'. text + check, not
--    a native enum, so drop-and-recreate is the only way to extend it.
-- ---------------------------------------------------------------------------
alter table public.activity_events drop constraint if exists activity_events_event_type_check;

alter table public.activity_events add constraint activity_events_event_type_check
  check (event_type in ('streak_milestone', 'challenge_completed', 'challenge_joined', 'friend_added', 'reshare'));

-- ---------------------------------------------------------------------------
-- 2. activity_reshares — tracks "has this user already reshared this
--    event", so the RPC below can toggle. No insert/delete policy: every
--    write goes through toggle_reshare (security definer bypasses RLS),
--    matching activity_reactions' / challenge_invites' established pattern.
-- ---------------------------------------------------------------------------
create table public.activity_reshares (
  original_event_id uuid not null references public.activity_events (id) on delete cascade,
  resharer_id uuid not null references public.profiles (id) on delete cascade,
  reshared_event_id uuid not null references public.activity_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (original_event_id, resharer_id)
);

alter table public.activity_reshares enable row level security;

create policy "users read their own reshares"
  on public.activity_reshares for select
  to authenticated
  using (auth.uid() = resharer_id);

create index activity_reshares_original_event_id_idx
  on public.activity_reshares (original_event_id);

-- ---------------------------------------------------------------------------
-- 3. Cascade-cleanup: if a reshare mapping row ever disappears (explicit
--    un-reshare below, OR the original event getting deleted by some future
--    feature, whose FK cascade on original_event_id removes the mapping row
--    but not the reshare post it points to), remove the reshare post too.
--    Can't recurse: a reshare event is never itself an original_event_id,
--    since toggle_reshare's allowlist blocks reshare-of-a-reshare.
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_reshares_cascade_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.activity_events where id = old.reshared_event_id;
  return old;
end;
$$;

create trigger trg_after_activity_reshare_delete_cascade
  after delete on public.activity_reshares
  for each row execute function public.trg_activity_reshares_cascade_delete();

-- ---------------------------------------------------------------------------
-- 4. toggle_reshare — mirrors toggle_activity_reaction's (0011) visibility
--    idiom exactly (owner = caller, or an accepted friendship exists),
--    plus the two gates from the design review above.
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

  if v_event_type not in ('streak_milestone', 'challenge_completed', 'challenge_joined') then
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

  if v_event_type in ('challenge_completed', 'challenge_joined') then
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
    -- trg_after_activity_reshare_delete_cascade removes the reshare post itself.
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

-- ---------------------------------------------------------------------------
-- 5. get_activity_reshare_counts — same shape/trade-off as
--    get_activity_reaction_counts (0011): batched, no per-id re-visibility-
--    check (only meaningful for event ids the caller already fetched via
--    get_friend_activity_feed; a bare count + boolean for a guessed id is
--    the same accepted low-severity disclosure already documented there).
-- ---------------------------------------------------------------------------
create or replace function public.get_activity_reshare_counts(p_event_ids uuid[])
returns table (
  event_id uuid,
  reshare_count bigint,
  reshared_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.original_event_id as event_id,
    count(*) as reshare_count,
    bool_or(r.resharer_id = auth.uid()) as reshared_by_me
  from public.activity_reshares r
  where r.original_event_id = any (p_event_ids)
  group by r.original_event_id;
$$;

grant execute on function public.get_activity_reshare_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Add challenge_id to the challenge-linked event payloads (body-only
--    changes, no signature change — both already have new.challenge_id in
--    scope). Lets the feed UI deep-link a challenge-related item (original
--    or reshared) to /challenge/[id] — what actually makes "share so anyone
--    can join" possible, not just the reshare mechanism itself.
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

  return new;
end;
$$;

create or replace function public.trg_challenge_participants_log_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;

  insert into public.activity_events (user_id, event_type, payload)
    values (
      new.user_id,
      'challenge_joined',
      jsonb_build_object('challenge_title', v_title, 'challenge_id', new.challenge_id)
    );

  return new;
end;
$$;
