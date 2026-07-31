-- Closes a real discovery gap: users can already tap into anyone's public
-- profile from the Global/City/Country leaderboards, the activity feed, and
-- challenge member lists (all pre-existing), but the ONLY way to send a
-- friend request has been typing their exact email into the League > Friends
-- tab — there's no way to friend-request someone directly from their profile
-- page. This migration adds the ID-based primitive that action needs, plus a
-- friend-count RPC so profiles can show it (mirroring 0019_follows.sql's
-- followerCount, which is public via an open `using (true)` policy on
-- `follows` — `friendships`' SELECT policy is intentionally NOT that open
-- (`auth.uid() = user_id or auth.uid() = friend_id`, 0001_init.sql), so a
-- security-definer RPC is needed to compute a *count* for an arbitrary
-- target user without exposing their actual friend list to the caller).
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0021_challenge_joined_activity_event.sql.

-- ---------------------------------------------------------------------------
-- send_friend_request — the same pending/reciprocal-accept logic
-- add_friend_by_email has had since 0004_friend_requests.sql, extracted to
-- take a user id directly so it can be called from a profile page (where the
-- target's id is already in hand) without an email round-trip.
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_existing_status text;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  if p_friend_id = v_self then
    raise exception 'You cannot add yourself as a friend';
  end if;

  if not exists (select 1 from public.profiles where id = p_friend_id) then
    raise exception 'No StepLeague user found';
  end if;

  -- Already friends (in either direction)? No-op rather than erroring.
  select status into v_existing_status
    from public.friendships
    where (user_id = v_self and friend_id = p_friend_id)
       or (user_id = p_friend_id and friend_id = v_self)
    limit 1;

  if v_existing_status = 'accepted' then
    return;
  end if;

  -- The other user already requested us — accept it instead of creating a
  -- second, redundant pending row in the opposite direction.
  if exists (
    select 1 from public.friendships
    where user_id = p_friend_id and friend_id = v_self and status = 'pending'
  ) then
    perform public.respond_to_friend_request(p_friend_id, true);
    return;
  end if;

  insert into public.friendships (user_id, friend_id, status)
    values (v_self, p_friend_id, 'pending')
    on conflict (user_id, friend_id) do update set status = 'pending';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;

-- add_friend_by_email now just resolves the email and delegates, instead of
-- duplicating the pending/reciprocal-accept logic above.
create or replace function public.add_friend_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_id uuid;
begin
  select id into v_friend_id from auth.users where email = p_email;

  if v_friend_id is null then
    raise exception 'No StepLeague user found with that email';
  end if;

  perform public.send_friend_request(v_friend_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_friend_count — accepted-friendship rows are always mirrored (one row
-- per direction, see respond_to_friend_request), so counting rows where
-- p_user_id is the `user_id` side alone already gives the correct total
-- with no need to also union the `friend_id` side.
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.friendships where user_id = p_user_id and status = 'accepted';
$$;

grant execute on function public.get_friend_count(uuid) to authenticated;
