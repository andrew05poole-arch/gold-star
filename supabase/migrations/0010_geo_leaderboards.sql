-- [Geo 2/3] Add city/country/global leaderboard RPCs.
-- Mirrors get_leaderboard(p_user_id) (0001_init.sql): ranks
-- leaderboard_week_scores over the current ISO week, with previous_rank
-- from the prior week over the same scope. Unlike the friends leaderboard,
-- these scope by profiles.city/profiles.country (case-insensitive) or not
-- at all (global), and are capped with `limit 100` since the candidate set
-- isn't naturally small.
--
-- No new RLS is needed: profiles are already readable by any authenticated
-- user (0001_init.sql) and these RPCs expose the same columns
-- (display_name, avatar_color, normalized_score) that get_leaderboard
-- already surfaces across users via security definer — just over a
-- city/country/global scope instead of a friend-list scope.

create or replace function public.get_city_leaderboard(p_city text)
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
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;

create or replace function public.get_country_leaderboard(p_country text)
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
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;

create or replace function public.get_global_leaderboard()
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
    r.normalized_score,
    r.rnk::int as rank,
    pw.rnk::int as previous_rank
  from ranked r
  join public.profiles p on p.id = r.fid
  left join prev_week pw on pw.fid = r.fid
  order by r.rnk
  limit 100;
$$;
