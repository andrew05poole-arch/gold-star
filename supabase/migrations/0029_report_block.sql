-- Report / block path (safety & trust) — issue #85.
--
-- StepLeague has public profiles, public (city/country/global) leaderboards,
-- and a friend-scoped activity feed with comments, but no way for a user to
-- report or block another user. App Store / Play policy (and basic user
-- safety) expect at minimum a report-user + block-user path before a wider
-- launch. This migration adds that foundation: two tables, the RPCs the app
-- calls, and DB-level enforcement so a block actually severs and prevents
-- contact rather than being cosmetic.
--
-- How a block is enforced (the important part):
--   - block_user() severs any existing connection both ways: it deletes the
--     friendship rows (both directions) and the follow rows (both directions)
--     between the two users. Because the friends leaderboard and friend
--     activity feed are friend-scoped, severing the friendship removes the
--     blocked user from those surfaces automatically — no per-surface filter
--     needed (same leverage 0013's single-point exclusion relies on).
--   - Re-contact is prevented at the DB, not just in the app: BEFORE INSERT
--     triggers on `friendships` and `follows` reject a new row when a block
--     exists in EITHER direction. This catches both the RPC paths
--     (send_friend_request / add_friend_by_*) AND direct table inserts the
--     RLS insert policies otherwise allow (0001/0019), so the guard can't be
--     bypassed by a hand-rolled client.
--
-- Scope (deliberately the "minimum viable" path the issue asks for):
--   - Reports are stored for later human/admin review; there is no in-app
--     admin queue yet (no admin UI exists in this repo). `status` is kept so a
--     review workflow can be added without a migration.
--   - Public/global/city/country leaderboards still list a blocked user (they
--     list all users, not a friend set). Hiding blocked users from those
--     public boards and from comment threads is a documented follow-up; the
--     block already removes them from every friend-scoped surface and stops
--     all direct friend/follow contact, which is the safety-critical part.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0028_step_plausibility_guard.sql.

-- ---------------------------------------------------------------------------
-- user_blocks — one row per (blocker, blocked) direction. A block is one-way
-- in storage (A blocks B), but enforcement below checks BOTH directions so a
-- single block stops contact either way.
-- ---------------------------------------------------------------------------
create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

-- A user sees and manages only their own blocks. The list is intentionally
-- NOT public (unlike follows) — who you've blocked is private.
create policy "users read their own blocks"
  on public.user_blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "users create their own blocks"
  on public.user_blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "users delete their own blocks"
  on public.user_blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- user_reports — a reporter flags another user (optionally tied to a reason /
-- free-text context). Stored for review; no admin UI yet.
-- ---------------------------------------------------------------------------
create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default 'other',
  context text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

alter table public.user_reports enable row level security;

-- A reporter can file and see their own reports; nobody else can read them
-- (review happens server-side / via an admin role, out of scope here).
create policy "users file their own reports"
  on public.user_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "users read their own reports"
  on public.user_reports for select
  to authenticated
  using (auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- are_blocked(a, b) — true if either user has blocked the other. Security
-- definer so the enforcement triggers can see blocks regardless of which user
-- is writing (user_blocks' SELECT policy only exposes the caller's own rows).
-- ---------------------------------------------------------------------------
create or replace function public.are_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- ---------------------------------------------------------------------------
-- block_user — record the block and sever any existing friendship/follow in
-- both directions. Idempotent (re-blocking is a no-op).
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;
  if p_blocked_id = v_self then
    raise exception 'You cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_blocked_id) then
    raise exception 'No StepLeague user found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
    values (v_self, p_blocked_id)
    on conflict (blocker_id, blocked_id) do nothing;

  -- Sever existing connections both ways.
  delete from public.friendships
    where (user_id = v_self and friend_id = p_blocked_id)
       or (user_id = p_blocked_id and friend_id = v_self);
  delete from public.follows
    where (follower_id = v_self and followee_id = p_blocked_id)
       or (follower_id = p_blocked_id and followee_id = v_self);
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unblock_user — remove the caller's own block row. Leaves any block the
-- other user placed on the caller intact (that's theirs to lift).
-- ---------------------------------------------------------------------------
create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_blocks
    where blocker_id = auth.uid() and blocked_id = p_blocked_id;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_blocked_users — the caller's blocked list, for a manage-blocks UI.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_blocked_users()
returns table (
  user_id uuid,
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
    b.blocked_id as user_id,
    p.display_name,
    p.avatar_color,
    p.avatar_url,
    b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_my_blocked_users() to authenticated;

-- ---------------------------------------------------------------------------
-- report_user — file a report against another user.
-- ---------------------------------------------------------------------------
create or replace function public.report_user(p_reported_id uuid, p_reason text default 'other', p_context text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;
  if p_reported_id = v_self then
    raise exception 'You cannot report yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_reported_id) then
    raise exception 'No StepLeague user found';
  end if;

  insert into public.user_reports (reporter_id, reported_id, reason, context)
    values (v_self, p_reported_id, coalesce(nullif(trim(p_reason), ''), 'other'), nullif(trim(p_context), ''));
end;
$$;

grant execute on function public.report_user(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement: reject a new friendship/follow when a block exists either way.
-- BEFORE INSERT so it covers both the security-definer RPCs and any direct
-- table insert the RLS insert policies permit.
-- ---------------------------------------------------------------------------
create or replace function public.trg_friendships_block_guard()
returns trigger
language plpgsql
as $$
begin
  if public.are_blocked(new.user_id, new.friend_id) then
    raise exception 'Cannot add a user you have blocked or who has blocked you';
  end if;
  return new;
end;
$$;

create trigger trg_friendships_block_guard
  before insert on public.friendships
  for each row execute function public.trg_friendships_block_guard();

create or replace function public.trg_follows_block_guard()
returns trigger
language plpgsql
as $$
begin
  if public.are_blocked(new.follower_id, new.followee_id) then
    raise exception 'Cannot follow a user you have blocked or who has blocked you';
  end if;
  return new;
end;
$$;

create trigger trg_follows_block_guard
  before insert on public.follows
  for each row execute function public.trg_follows_block_guard();
