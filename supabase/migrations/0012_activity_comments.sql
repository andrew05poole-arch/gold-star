-- Comments on activity events (issue #35, "[Feed 3/4]"). Attaches to the
-- rows `0008_activity_events.sql` creates; the Feed UI (#36) reads/writes
-- these via the RPCs below. Mirrors the same "no broad friends-can-select
-- RLS policy" trade-off `0008` documents for `get_friend_activity_feed`:
-- expressing friend-or-self visibility correctly in a USING clause is easy
-- to get subtly wrong, so visibility checks go through security-definer
-- RPCs that reuse `get_friend_activity_feed` rather than duplicating the
-- friend-set logic in a policy.
--
-- ---------------------------------------------------------------------------
-- activity_comments
-- ---------------------------------------------------------------------------
create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.activity_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) <= 280),
  created_at timestamptz not null default now()
);

alter table public.activity_comments enable row level security;

-- Own rows are always readable/insertable/deletable directly off the table.
-- Friend-scoped reads of *other* users' comments go through
-- `get_activity_comments` below (which re-checks event visibility via the
-- same friend-set logic `get_friend_activity_feed` uses) rather than a
-- broad "friends can select" policy.
create policy "users read their own comments"
  on public.activity_comments for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users insert their own comments"
  on public.activity_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users delete their own comments"
  on public.activity_comments for delete
  to authenticated
  using (auth.uid() = user_id);

create index activity_comments_event_id_created_at_idx
  on public.activity_comments (event_id, created_at);

-- ---------------------------------------------------------------------------
-- Shared visibility check: can auth.uid() see event p_event_id? True iff the
-- event belongs to auth.uid() or to one of their accepted friends — the same
-- friend set `get_friend_activity_feed` computes. Implemented by delegating
-- to that function (rather than re-deriving the friendships CTE here) so the
-- two stay in lockstep if the friend-visibility rule ever changes.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_activity_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.get_friend_activity_feed(auth.uid()) f
    where f.id = p_event_id
  );
$$;

grant execute on function public.can_view_activity_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- add_activity_comment(p_event_id, p_body) — insert a comment on an event
-- the caller can see (self or accepted friend), enforcing the 280-char body
-- limit at the RPC layer too (in addition to the table check constraint) so
-- callers get a clean error rather than a raw constraint-violation message.
-- Returns the new row.
-- ---------------------------------------------------------------------------
create or replace function public.add_activity_comment(p_event_id uuid, p_body text)
returns public.activity_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := trim(p_body);
  v_row public.activity_comments;
begin
  if v_body = '' then
    raise exception 'Comment body must not be empty';
  end if;

  if char_length(v_body) > 280 then
    raise exception 'Comment body must be 280 characters or fewer';
  end if;

  if not public.can_view_activity_event(p_event_id) then
    raise exception 'Activity event not found';
  end if;

  insert into public.activity_comments (event_id, user_id, body)
    values (p_event_id, auth.uid(), v_body)
    returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.add_activity_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_activity_comments(p_event_id) — all comments for an event the caller
-- can see (self or accepted friend), oldest first, with the commenter's
-- display info joined in (mirrors the shape `get_friend_activity_feed`
-- returns for events).
-- ---------------------------------------------------------------------------
create or replace function public.get_activity_comments(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_color text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_activity_event(p_event_id) then
    raise exception 'Activity event not found';
  end if;

  return query
    select
      c.id,
      c.user_id,
      p.display_name,
      p.avatar_color,
      c.body,
      c.created_at
    from public.activity_comments c
    join public.profiles p on p.id = c.user_id
    where c.event_id = p_event_id
    order by c.created_at asc;
end;
$$;

grant execute on function public.get_activity_comments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_activity_comment(p_comment_id) — deletes a comment the caller owns.
-- Plain RLS (the "users delete their own comments" policy above) already
-- enforces ownership on a direct `delete from activity_comments`; this RPC
-- exists only for client convenience/consistency with `add_activity_comment`
-- and to surface a clear error when the row doesn't exist or isn't owned by
-- the caller, rather than a silent no-op delete.
-- ---------------------------------------------------------------------------
create or replace function public.delete_activity_comment(p_comment_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.activity_comments
    where id = p_comment_id and user_id = auth.uid();

  if not found then
    raise exception 'Comment not found';
  end if;
end;
$$;

grant execute on function public.delete_activity_comment(uuid) to authenticated;
