-- Pending/accept friend-request flow (issue #6, P0).
--
-- `add_friend_by_email` previously inserted BOTH directions of a friendship
-- as 'accepted' in one call — no consent step for the recipient. The
-- `friendships.status` column (`pending` | `accepted`) already existed but
-- was unused. This migration:
--
--   1. Redefines `add_friend_by_email` to insert a single, directional
--      'pending' row (requester -> recipient) instead of a mutual pair.
--   2. Adds `respond_to_friend_request(p_requester_id, p_accept)` for the
--      recipient to accept (flips to 'accepted' and creates the mirrored
--      reverse row so the existing symmetric-friendship reads keep working)
--      or decline (deletes the pending row).
--   3. Adds `get_pending_friend_requests()` so the recipient can see
--      incoming requests and act on them.
--   4. Confirms `get_leaderboard` already filters on status = 'accepted'
--      (it does, unchanged from 0001_init.sql) so pending requests never
--      leak into the leaderboard/friend list.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Send a friend request by email (replaces the old instant-mutual-add
-- behavior). Inserts a single directional row from the requester to the
-- recipient with status = 'pending'.
-- ---------------------------------------------------------------------------
create or replace function public.add_friend_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_id uuid;
  v_self uuid := auth.uid();
  v_existing_status text;
begin
  select id into v_friend_id from auth.users where email = p_email;

  if v_friend_id is null then
    raise exception 'No StepLeague user found with that email';
  end if;

  if v_friend_id = v_self then
    raise exception 'You cannot add yourself as a friend';
  end if;

  -- Already friends (in either direction)? No-op rather than erroring.
  select status into v_existing_status
    from public.friendships
    where (user_id = v_self and friend_id = v_friend_id)
       or (user_id = v_friend_id and friend_id = v_self)
    limit 1;

  if v_existing_status = 'accepted' then
    return;
  end if;

  -- The other user already requested us — accept it instead of creating a
  -- second, redundant pending row in the opposite direction.
  if exists (
    select 1 from public.friendships
    where user_id = v_friend_id and friend_id = v_self and status = 'pending'
  ) then
    perform public.respond_to_friend_request(v_friend_id, true);
    return;
  end if;

  insert into public.friendships (user_id, friend_id, status)
    values (v_self, v_friend_id, 'pending')
    on conflict (user_id, friend_id) do update set status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept or decline an incoming friend request. `p_requester_id` is the
-- other user (the one whose request the current user is responding to).
-- Accepting flips the pending row to 'accepted' and inserts the mirrored
-- reverse row (also 'accepted') so friendship reads/RLS stay symmetric,
-- matching how the rest of the schema (get_leaderboard) expects two rows.
-- Declining simply deletes the pending row.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_friend_request(p_requester_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if not exists (
    select 1 from public.friendships
    where user_id = p_requester_id and friend_id = v_self and status = 'pending'
  ) then
    raise exception 'No pending friend request from that user';
  end if;

  if p_accept then
    update public.friendships
      set status = 'accepted'
      where user_id = p_requester_id and friend_id = v_self;

    insert into public.friendships (user_id, friend_id, status)
      values (v_self, p_requester_id, 'accepted')
      on conflict (user_id, friend_id) do update set status = 'accepted';
  else
    delete from public.friendships
      where user_id = p_requester_id and friend_id = v_self and status = 'pending';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Incoming pending friend requests for the current user (i.e. requests
-- other users have sent them, awaiting a response).
-- ---------------------------------------------------------------------------
create or replace function public.get_pending_friend_requests()
returns table (
  requester_id uuid,
  display_name text,
  avatar_color text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.user_id as requester_id,
    p.display_name,
    p.avatar_color,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.user_id
  where f.friend_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- RLS: allow the recipient of a pending request to update its status
-- (accept) — previously only the requester (row owner via user_id) could
-- write to `friendships` at all beyond the initial insert. The
-- respond_to_friend_request RPC is `security definer` so it doesn't
-- strictly need this policy to function, but it's added for defense in
-- depth / direct-table access parity, and so a future non-RPC read of
-- "can I act on this row" via RLS behaves sanely.
-- ---------------------------------------------------------------------------
create policy "recipients can update pending requests sent to them"
  on public.friendships for update
  to authenticated
  using (auth.uid() = friend_id and status = 'pending');

create policy "recipients can delete pending requests sent to them"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = friend_id and status = 'pending');

-- ---------------------------------------------------------------------------
-- get_leaderboard already filters `status = 'accepted'` on both directions
-- (see 0001_init.sql) so no change is needed there — pending requests are
-- correctly excluded from the leaderboard/friend list. Re-declared here
-- unchanged as a guard so this migration is the single source of truth if
-- that ever regresses.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  normalized_score numeric,
  rank integer,
  previous_rank integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_week as (
    select date_trunc('week', now() at time zone 'UTC')::date as week_id
  ),
  friend_ids as (
    select friend_id as id from public.friendships where user_id = p_user_id and status = 'accepted'
    union
    select user_id as id from public.friendships where friend_id = p_user_id and status = 'accepted'
    union
    select p_user_id
  ),
  scores as (
    select f.id as fid, coalesce(s.normalized_score, 0) as normalized_score
    from friend_ids f
    left join public.leaderboard_week_scores s
      on s.user_id = f.id and s.week_id = (select week_id from current_week)
  ),
  ranked as (
    select fid, normalized_score, rank() over (order by normalized_score desc) as rnk
    from scores
  ),
  prev_week as (
    select s.user_id as fid, rank() over (order by s.normalized_score desc) as rnk
    from public.leaderboard_week_scores s
    where s.week_id = (select week_id from current_week) - interval '7 day'
      and s.user_id in (select id from friend_ids)
  )
  select
    r.fid as user_id,
    p.display_name,
    p.avatar_color,
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk;
$$;
