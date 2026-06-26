-- StepLeague MVP schema.
-- Mirrors the data model sketch in docs/PRD.md §13.1 and the algorithms in §13.2-§13.5.
-- Run once in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_color text not null default '#FF6B4A',
  daily_goal integer not null default 10000,
  height_cm numeric,
  stride_length_cm numeric,
  difficulty_band text not null default 'even' check (difficulty_band in ('chill', 'even', 'pushy')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users manage their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- step_records — one row per user per local day (§13.1, §13.2)
-- ---------------------------------------------------------------------------
create table public.step_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  raw_steps integer not null default 0,
  normalized_steps numeric not null default 0,
  source text not null default 'mock' check (source in ('healthkit', 'googlefit', 'mock')),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.step_records enable row level security;

create policy "users manage their own step records"
  on public.step_records for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Step Normalizer (§13.2): distance-equivalent normalization against a fixed
-- reference stride, falling back to a height estimate, then a flat default.
create or replace function public.compute_normalized_steps()
returns trigger
language plpgsql
as $$
declare
  v_stride numeric;
  v_height numeric;
  v_reference_stride constant numeric := 71; -- REFERENCE_STRIDE_CM
  v_default_stride constant numeric := 71; -- DEFAULT_STRIDE_CM
begin
  select stride_length_cm, height_cm into v_stride, v_height
  from public.profiles where id = new.user_id;

  if v_stride is null then
    v_stride := coalesce(v_height * 0.415, v_default_stride);
  end if;

  new.normalized_steps := new.raw_steps * (v_stride / v_reference_stride);
  return new;
end;
$$;

create trigger trg_compute_normalized_steps
  before insert or update of raw_steps on public.step_records
  for each row execute function public.compute_normalized_steps();

-- ---------------------------------------------------------------------------
-- streaks (§13.1, §13.5) — recomputed whenever a step_record qualifies.
-- ---------------------------------------------------------------------------
create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_length integer not null default 0,
  longest_length integer not null default 0,
  last_qualified_date date,
  freezes_remaining integer not null default 2,
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;

create policy "users read their own streak"
  on public.streaks for select
  to authenticated
  using (auth.uid() = user_id);

-- Streak floor (60% of daily goal, §13.5) + up-to-2 freezes for a single
-- missed day. Only re-evaluated for today's row; backfilled historical rows
-- re-trigger this on update so late-syncing data can retroactively qualify.
create or replace function public.recompute_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal integer;
  v_floor numeric;
  v_today date := current_date;
  v_today_raw integer;
  v_row record;
begin
  select daily_goal into v_goal from public.profiles where id = p_user_id;
  v_floor := v_goal * 0.6;

  select raw_steps into v_today_raw from public.step_records
   where user_id = p_user_id and date = v_today;

  if coalesce(v_today_raw, 0) < v_floor then
    return;
  end if;

  insert into public.streaks (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  select * into v_row from public.streaks where user_id = p_user_id;

  if v_row.last_qualified_date is null or v_row.last_qualified_date = v_today - 1 then
    update public.streaks set
      current_length = current_length + 1,
      longest_length = greatest(longest_length, current_length + 1),
      last_qualified_date = v_today,
      updated_at = now()
    where user_id = p_user_id;
  elsif v_row.last_qualified_date = v_today then
    null; -- already counted
  elsif v_row.last_qualified_date = v_today - 2 and v_row.freezes_remaining > 0 then
    update public.streaks set
      current_length = current_length + 1,
      longest_length = greatest(longest_length, current_length + 1),
      last_qualified_date = v_today,
      freezes_remaining = freezes_remaining - 1,
      updated_at = now()
    where user_id = p_user_id;
  else
    update public.streaks set
      current_length = 1,
      last_qualified_date = v_today,
      updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.trg_step_record_recompute_streak()
returns trigger
language plpgsql
as $$
begin
  perform public.recompute_streak(new.user_id);
  return new;
end;
$$;

create trigger trg_after_step_record_upsert
  after insert or update of raw_steps on public.step_records
  for each row execute function public.trg_step_record_recompute_streak();

-- ---------------------------------------------------------------------------
-- friendships (§13.1) — MVP simplification: added directly as 'accepted'
-- (one-click mutual add by email). Pending/request UX is a Phase 2 backlog
-- item; the status column is kept so that flow can be added without a
-- migration.
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

create policy "users read friendships they're part of"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create policy "users create their own friendship rows"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Add (or re-accept) a mutual friendship by the other user's email.
create or replace function public.add_friend_by_email(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_id uuid;
  v_self uuid := auth.uid();
begin
  select id into v_friend_id from auth.users where email = p_email;

  if v_friend_id is null then
    raise exception 'No StepLeague user found with that email';
  end if;

  if v_friend_id = v_self then
    raise exception 'You cannot add yourself as a friend';
  end if;

  insert into public.friendships (user_id, friend_id, status) values (v_self, v_friend_id, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
  insert into public.friendships (user_id, friend_id, status) values (v_friend_id, v_self, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
end;
$$;

-- ---------------------------------------------------------------------------
-- challenges (§13.1) — MVP presets, joinable by anyone.
-- ---------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  goal_type text not null check (goal_type in ('stepsPerDay', 'totalSteps', 'daysStreak')),
  goal_value integer not null,
  duration_days integer not null,
  created_by uuid references public.profiles (id),
  starts_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

create policy "challenges are readable by any authenticated user"
  on public.challenges for select
  to authenticated
  using (true);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress numeric not null default 0,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.challenge_participants enable row level security;

create policy "participants are readable by any authenticated user"
  on public.challenge_participants for select
  to authenticated
  using (true);

create policy "users join challenges as themselves"
  on public.challenge_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users update their own challenge progress"
  on public.challenge_participants for update
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- rival_profiles (§13.1, §13.3) — a per-user simulated opponent.
-- ---------------------------------------------------------------------------
create table public.rival_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default 'Echo',
  difficulty_band text not null default 'even' check (difficulty_band in ('chill', 'even', 'pushy')),
  updated_at timestamptz not null default now()
);

alter table public.rival_profiles enable row level security;

create policy "users manage their own rival profile"
  on public.rival_profiles for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- AI Rival basic logic (§13.3): trailing 7-day normalized average × a
-- difficulty band, clamped to [MIN_TARGET, MAX_TARGET].
create or replace function public.get_rival_target(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with trailing as (
    select avg(normalized_steps) as avg_steps
    from public.step_records
    where user_id = p_user_id
      and date >= current_date - interval '7 day'
      and normalized_steps > 0
  ),
  band as (
    select case difficulty_band
      when 'chill' then 0.95
      when 'pushy' then 1.15
      else 1.05
    end as factor
    from public.rival_profiles
    where user_id = p_user_id
  )
  select greatest(
    3000, -- MIN_TARGET
    least(
      20000, -- MAX_TARGET
      round(coalesce((select avg_steps from trailing), 6000) * coalesce((select factor from band), 1.05))
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Weekly leaderboard (§13.4) — single global UTC-Monday anchor.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_week_scores as
select
  user_id,
  date_trunc('week', date::timestamp at time zone 'UTC')::date as week_id,
  sum(normalized_steps) as normalized_score
from public.step_records
group by user_id, date_trunc('week', date::timestamp at time zone 'UTC');

-- Friends + self, ranked for the current week, with each row's rank from the
-- prior week (over the same friend set) for the up/down/flat arrow.
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
