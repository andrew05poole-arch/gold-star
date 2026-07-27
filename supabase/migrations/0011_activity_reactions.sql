-- Reactions (likes) on activity events (issue #34, "[Feed 2/4]"). Builds on
-- `activity_events` (0008_activity_events.sql); the Feed UI (#36) is a
-- separate follow-up issue — this migration is schema + RPCs only.
--
-- ---------------------------------------------------------------------------
-- activity_reactions
-- ---------------------------------------------------------------------------
create table public.activity_reactions (
  event_id uuid not null references public.activity_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.activity_reactions enable row level security;

-- Same trade-off as `activity_events` itself (0008): no broad "friends can
-- select reactions on events they can see" policy here, since that would
-- have to duplicate the friend-lookup logic `get_friend_activity_feed`
-- encapsulates and risks drifting out of sync with it. A user can always
-- read/write their OWN reaction rows directly; friend-scoped visibility
-- (can I even see this event, and how many reactions does it have) is
-- handled by the security-definer RPCs below, which re-check event
-- visibility explicitly.
create policy "users read their own reactions"
  on public.activity_reactions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert their own reactions"
  on public.activity_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users delete their own reactions"
  on public.activity_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

create index activity_reactions_event_id_idx
  on public.activity_reactions (event_id);

-- ---------------------------------------------------------------------------
-- toggle_activity_reaction — like/unlike an event. Mirrors the friend-set
-- CTE `get_friend_activity_feed` (0008) uses, so "can the caller see this
-- event" is judged by the exact same rule as the feed itself: the event's
-- owner must be the caller or an accepted friend of the caller. Raises if
-- the event doesn't exist or isn't visible, rather than silently no-op'ing,
-- so a client bug (reacting to an event id it was never shown) surfaces
-- loudly instead of leaving orphaned reaction rows.
-- ---------------------------------------------------------------------------
create or replace function public.toggle_activity_reaction(p_event_id uuid)
returns table (
  reacted boolean,
  reaction_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_visible boolean;
begin
  select user_id into v_owner from public.activity_events where id = p_event_id;

  if v_owner is null then
    raise exception 'activity event % not found', p_event_id;
  end if;

  select exists (
    select 1
    from public.friendships
    where status = 'accepted'
      and (
        (user_id = v_caller and friend_id = v_owner)
        or (friend_id = v_caller and user_id = v_owner)
      )
  ) or v_owner = v_caller
    into v_visible;

  if not v_visible then
    raise exception 'activity event % is not visible to the caller', p_event_id;
  end if;

  if exists (
    select 1 from public.activity_reactions
    where event_id = p_event_id and user_id = v_caller
  ) then
    delete from public.activity_reactions
      where event_id = p_event_id and user_id = v_caller;
  else
    insert into public.activity_reactions (event_id, user_id)
      values (p_event_id, v_caller);
  end if;

  return query
    select
      exists (
        select 1 from public.activity_reactions
        where event_id = p_event_id and user_id = v_caller
      ) as reacted,
      (
        select count(*) from public.activity_reactions
        where event_id = p_event_id
      ) as reaction_count;
end;
$$;

grant execute on function public.toggle_activity_reaction(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_activity_reaction_counts — batch counts + "did I react" for the Feed
-- UI (#36) to render alongside a page of events without an N+1 query per
-- row. Does NOT re-check friend visibility of each event id (unlike
-- `toggle_activity_reaction`): counts/reacted-by-me are only ever
-- meaningful for events the caller already fetched via
-- `get_friend_activity_feed`, and leaking a bare count + boolean for an
-- arbitrary event id the caller guesses is a low-severity disclosure (no
-- payload/content is exposed) — accepted here the same way `get_leaderboard`
-- accepts a caller-supplied `p_user_id` in 0001_init.sql. Events with zero
-- reactions are simply omitted from the result set (left join would be
-- needed client-side to fill in zeros) since the caller already knows the
-- full set of ids it asked about.
-- ---------------------------------------------------------------------------
create or replace function public.get_activity_reaction_counts(p_event_ids uuid[])
returns table (
  event_id uuid,
  reaction_count bigint,
  reacted_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.event_id,
    count(*) as reaction_count,
    bool_or(r.user_id = auth.uid()) as reacted_by_me
  from public.activity_reactions r
  where r.event_id = any (p_event_ids)
  group by r.event_id;
$$;

grant execute on function public.get_activity_reaction_counts(uuid[]) to authenticated;
