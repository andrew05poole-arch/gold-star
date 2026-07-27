-- Activity feed foundation: schema + auto-logging triggers (issue #33,
-- "[Feed 1/4]"). Reactions (#34) and comments (#35) attach to the rows this
-- migration creates; the Feed UI (#36) reads them via
-- `get_friend_activity_feed`. This migration is schema + population logic
-- only — no reactions/comments tables, no UI.
--
-- ---------------------------------------------------------------------------
-- activity_events
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('streak_milestone', 'challenge_completed', 'challenge_joined', 'friend_added')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.activity_events enable row level security;

-- A user's own events are always readable directly off the table (e.g. for
-- a future "my activity" view). Friend visibility deliberately does NOT get
-- a broad "friends can select" RLS policy here — expressing "rows belonging
-- to any of my accepted friends" correctly and efficiently in a USING clause
-- is easy to get subtly wrong (and easy to leave overly permissive as the
-- friendship model evolves). Instead, friend-scoped reads go through
-- `get_friend_activity_feed` below, a `security definer` RPC that computes
-- the friend set explicitly — the same trade-off `get_leaderboard` already
-- makes for cross-user reads in 0001_init.sql.
create policy "users read their own activity events"
  on public.activity_events for select
  to authenticated
  using (auth.uid() = user_id);

create index activity_events_user_id_created_at_idx
  on public.activity_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Friend activity feed (mirrors get_leaderboard's friend_ids CTE pattern).
-- Caller + accepted friends' events, newest first, capped at 100 rows.
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_activity_feed(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_color text,
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
-- Streak milestones (3 / 7 / 30 days) — fires on the specific crossing, not
-- every day past it. `recompute_streak` (0001_init.sql) only ever mutates
-- `current_length` via UPDATE (the initial row insert always starts at the
-- column default 0), so an AFTER UPDATE OF current_length trigger sees both
-- the old and new value for every change and can diff them directly, with
-- no need to redefine `recompute_streak` itself.
-- ---------------------------------------------------------------------------
create or replace function public.trg_streaks_log_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_milestone integer;
begin
  foreach v_milestone in array array[3, 7, 30] loop
    if old.current_length < v_milestone and new.current_length >= v_milestone then
      insert into public.activity_events (user_id, event_type, payload)
        values (
          new.user_id,
          'streak_milestone',
          jsonb_build_object('streak_length', new.current_length)
        );
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_after_streak_update_log_milestone
  after update of current_length on public.streaks
  for each row execute function public.trg_streaks_log_milestone();

-- ---------------------------------------------------------------------------
-- Challenge completion — `challenge_participant_status` (0005_challenge_
-- completion.sql) derives status ('active' | 'completed' | 'expired') at
-- read time from `progress` vs. `goal_value` once the join-anchored window
-- has closed, so there is no stored status column to watch for a write-time
-- transition. The only writes that ever touch a participation row after
-- join are `progress` updates from `recompute_challenge_progress`
-- (0002_challenge_progress.sql, fired off `step_records` inserts/updates).
-- This trigger recomputes the same status inline on every such write and
-- logs the event the moment a write causes the derived status to become
-- 'completed' when it previously wasn't.
--
-- Known gap (shared with 0005's own read-time design): if a participant's
-- progress already met the goal before the window closed and they simply
-- stop syncing steps, no further write ever occurs, so the transition to
-- 'completed' happens silently at read time with no trigger to catch it —
-- no activity event is logged for that participant. This matches the
-- existing trade-off documented in 0005 (status is only ever *observed*
-- live via the view) and is an acceptable gap for the feed's "nice to
-- see" nature; it isn't a source of truth that other logic depends on.
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
        jsonb_build_object('challenge_title', v_challenge.title)
      );
  end if;

  return new;
end;
$$;

create trigger trg_after_challenge_participant_progress_log_completion
  after update of progress on public.challenge_participants
  for each row execute function public.trg_challenge_participants_log_completion();

-- ---------------------------------------------------------------------------
-- Friend added — a new trigger on `friendships` rather than redefining
-- `respond_to_friend_request` (0004_friend_requests.sql). Acceptance writes
-- two rows to `friendships` (the original pending row flips to 'accepted'
-- via UPDATE; the mirrored reverse row is INSERTed already 'accepted'), and
-- both rows independently carry the `user_id` whose event this is — so a
-- single AFTER INSERT OR UPDATE trigger that fires whenever a row *becomes*
-- 'accepted' naturally logs one event per user without needing to know
-- which RPC or code path produced the row. This is more robust than
-- editing `respond_to_friend_request` in place: it also covers any future
-- direct-table acceptance path, and keeps the already-shipped 0004
-- migration untouched per the project's migration convention.
-- ---------------------------------------------------------------------------
create or replace function public.trg_friendships_log_friend_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    insert into public.activity_events (user_id, event_type, payload)
      values (
        new.user_id,
        'friend_added',
        jsonb_build_object('friend_id', new.friend_id)
      );
  end if;
  return new;
end;
$$;

create trigger trg_after_friendship_write_log_friend_added
  after insert or update of status on public.friendships
  for each row execute function public.trg_friendships_log_friend_added();
