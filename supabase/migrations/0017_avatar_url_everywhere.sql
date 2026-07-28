-- Surface the new profile photo (0016_profile_bio_and_photo.sql) everywhere
-- an avatar already renders: leaderboards, friend requests, the activity
-- feed, and comments. Every RPC touched here already returns
-- `display_name`/`avatar_color`; this just adds `avatar_url` alongside it.
--
-- Every one of these is a `RETURNS TABLE(...)` function, and Postgres does
-- NOT allow `CREATE OR REPLACE FUNCTION` to change a function's return
-- type (unlike appending a new *parameter* with a default, which is fine —
-- see 0015_scheduled_challenges.sql's create_challenge change). Each must
-- be explicitly dropped by its exact current signature before being
-- recreated with the extra output column. Explicit `grant execute` is
-- added for every one of them (even the few that relied on Supabase's
-- schema-level default privileges before, with no explicit grant in their
-- original migration) so recreating them can't silently regress client
-- access to an assumption about default-privilege behavior.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0016_profile_bio_and_photo.sql.

-- ---------------------------------------------------------------------------
-- get_leaderboard(uuid) — 0001_init.sql, re-declared unchanged in
-- 0004_friend_requests.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.get_leaderboard(uuid);

create function public.get_leaderboard(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
    p.avatar_url,
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk;
$$;

grant execute on function public.get_leaderboard(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_city_leaderboard(text), get_country_leaderboard(text),
-- get_global_leaderboard() — 0010_geo_leaderboards.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.get_city_leaderboard(text);

create function public.get_city_leaderboard(p_city text)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
  scope_ids as (
    select id from public.profiles where lower(city) = lower(p_city)
  ),
  scores as (
    select f.id as fid, coalesce(s.normalized_score, 0) as normalized_score
    from scope_ids f
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
      and s.user_id in (select id from scope_ids)
  )
  select
    r.fid as user_id,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;

grant execute on function public.get_city_leaderboard(text) to authenticated;

drop function if exists public.get_country_leaderboard(text);

create function public.get_country_leaderboard(p_country text)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
  scope_ids as (
    select id from public.profiles where lower(country) = lower(p_country)
  ),
  scores as (
    select f.id as fid, coalesce(s.normalized_score, 0) as normalized_score
    from scope_ids f
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
      and s.user_id in (select id from scope_ids)
  )
  select
    r.fid as user_id,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;

grant execute on function public.get_country_leaderboard(text) to authenticated;

drop function if exists public.get_global_leaderboard();

create function public.get_global_leaderboard()
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
  scope_ids as (
    select id from public.profiles
  ),
  scores as (
    select f.id as fid, coalesce(s.normalized_score, 0) as normalized_score
    from scope_ids f
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
      and s.user_id in (select id from scope_ids)
  )
  select
    r.fid as user_id,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;

grant execute on function public.get_global_leaderboard() to authenticated;

-- ---------------------------------------------------------------------------
-- get_pending_friend_requests() — 0004_friend_requests.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.get_pending_friend_requests();

create function public.get_pending_friend_requests()
returns table (
  requester_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
    p.avatar_url,
    f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.user_id
  where f.friend_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

grant execute on function public.get_pending_friend_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- get_friend_activity_feed(uuid) — 0008_activity_events.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.get_friend_activity_feed(uuid);

create function public.get_friend_activity_feed(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
  event_type text,
  payload jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with friend_ids as (
    select friend_id as id from public.friendships where user_id = p_user_id and status = 'accepted'
    union
    select user_id as id from public.friendships where friend_id = p_user_id and status = 'accepted'
    union
    select p_user_id
  )
  select
    e.id,
    e.user_id,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    e.event_type,
    e.payload,
    e.created_at
  from public.activity_events e
  join public.profiles p on p.id = e.user_id
  where e.user_id in (select id from friend_ids)
  order by e.created_at desc
  limit 100;
$$;

grant execute on function public.get_friend_activity_feed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_activity_comments(uuid) — 0012_activity_comments.sql.
-- ---------------------------------------------------------------------------
drop function if exists public.get_activity_comments(uuid);

create function public.get_activity_comments(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_color text,
  avatar_url text,
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
      p.avatar_url,
      c.body,
      c.created_at
    from public.activity_comments c
    join public.profiles p on p.id = c.user_id
    where c.event_id = p_event_id
    order by c.created_at asc;
end;
$$;

grant execute on function public.get_activity_comments(uuid) to authenticated;
