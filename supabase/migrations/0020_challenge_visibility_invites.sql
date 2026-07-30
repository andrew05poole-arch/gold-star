-- Challenge visibility (public/invite-only) + invites.
--
-- Creators can now make a challenge invite-only: hidden from the public
-- joinable list, visible only to the creator, existing participants, and
-- people explicitly invited — joinable ONLY by accepting an invite, never
-- via the direct client-side upsert `joinChallenge()` already uses for
-- public challenges (app-mobile/lib/api/challenges.ts).
--
-- An independent design-validation pass caught a real gap before this was
-- written: `challenge_participants`' SELECT policy has been `using (true)`
-- (fully open) since 0001_init.sql and was never revisited by 0002, 0005,
-- 0014, or 0015. Fixing only `challenges`' visibility would leave that base
-- table directly queryable by anyone, leaking exactly who's in an
-- invite-only challenge (and, since `profiles` is also open-read,
-- deanonymizing them) even though the challenge itself would correctly be
-- hidden from listings. Both tables' SELECT policies are fixed together
-- here, not as a follow-up.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0019_follows.sql.

-- ---------------------------------------------------------------------------
-- 1. visibility column.
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column visibility text not null default 'public' check (visibility in ('public', 'invite_only'));

-- ---------------------------------------------------------------------------
-- 2. challenge_invites — created before the policy rewrites below, since a
--    policy's USING clause is validated against real tables at CREATE POLICY
--    time; a forward reference to a not-yet-existing table would fail.
--    No insert/delete policy at all: every write goes through the two RPCs
--    below (security definer bypasses RLS), matching how `challenges`
--    itself has no insert policy and relies entirely on `create_challenge`.
-- ---------------------------------------------------------------------------
create table public.challenge_invites (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  invited_user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (challenge_id, invited_user_id)
);

alter table public.challenge_invites enable row level security;

create policy "invited users and inviters can read invites"
  on public.challenge_invites for select
  to authenticated
  using (auth.uid() = invited_user_id or auth.uid() = invited_by);

-- ---------------------------------------------------------------------------
-- 3. Shared window-open check — extracted so the same "has this challenge's
--    shared window already closed?" condition (0015_scheduled_challenges.sql)
--    can't drift across the three places that now need it: the
--    challenge_participants INSERT/UPDATE policies below, and
--    respond_to_challenge_invite (which bypasses RLS as security definer, so
--    it must re-check this manually rather than relying on the policy).
-- ---------------------------------------------------------------------------
create or replace function public.challenge_window_open(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and current_date <= (c.starts_at + c.duration_days - 1)
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. challenges SELECT — visibility-gated. Public challenges stay visible to
--    everyone; invite-only ones are visible only to their creator, existing
--    participants (so a joined member keeps seeing it after joining,
--    regardless of who they are), and anyone with a pending invite (so the
--    invite itself has a title/goal to display before they've joined).
-- ---------------------------------------------------------------------------
drop policy if exists "challenges are readable by any authenticated user" on public.challenges;

create policy "challenges are readable by any authenticated user"
  on public.challenges for select
  to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = id and cp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.challenge_invites ci
      where ci.challenge_id = id and ci.invited_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. challenge_participants SELECT — the gap the design review caught.
--    Always see your own row. See every row once you've joined an
--    invite-only challenge (so fellow members are visible to each other) or
--    if you created it. Being merely invited (not yet joined) does NOT
--    unlock the full member list — nothing to show there yet.
-- ---------------------------------------------------------------------------
drop policy if exists "participants are readable by any authenticated user" on public.challenge_participants;

create policy "participants are readable by any authenticated user"
  on public.challenge_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_id and (c.visibility = 'public' or c.created_by = auth.uid())
    )
    or exists (
      select 1 from public.challenge_participants cp2
      where cp2.challenge_id = challenge_id and cp2.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. challenge_participants INSERT — now also requires visibility = 'public'.
--    This is what actually forces invite-only challenges through
--    respond_to_challenge_invite (security definer, bypasses this policy)
--    instead of the direct client upsert (`joinChallenge()`).
-- ---------------------------------------------------------------------------
drop policy if exists "users join challenges as themselves" on public.challenge_participants;

create policy "users join challenges as themselves"
  on public.challenge_participants for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.challenges c where c.id = challenge_id and c.visibility = 'public')
    and public.challenge_window_open(challenge_id)
  );

-- ---------------------------------------------------------------------------
-- 7. challenge_participants UPDATE — unchanged in intent from 0015 (blocks
--    joinChallenge()'s upsert-onConflict path from resetting progress after
--    the window closes), just rewritten against the shared helper. No
--    visibility check needed: an UPDATE only ever targets a row that already
--    legitimately exists (via either public join or an accepted invite), so
--    there's nothing further to gate on visibility here.
-- ---------------------------------------------------------------------------
drop policy if exists "users update their own challenge progress" on public.challenge_participants;

create policy "users update their own challenge progress"
  on public.challenge_participants for update
  to authenticated
  using (auth.uid() = user_id and public.challenge_window_open(challenge_id));

-- ---------------------------------------------------------------------------
-- 8. invite_to_challenge — creator-only for v1 (not open to any participant)
--    to keep the permission model simple; can be relaxed later. Target must
--    be an accepted friend, mirroring "pick from your friends list" in the
--    UI rather than allowing arbitrary invites by email.
-- ---------------------------------------------------------------------------
create or replace function public.invite_to_challenge(p_challenge_id uuid, p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_creator uuid;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  select created_by into v_creator from public.challenges where id = p_challenge_id;
  if v_creator is null then
    raise exception 'Challenge not found';
  end if;
  if v_creator <> v_self then
    raise exception 'Only the challenge creator can invite people';
  end if;

  if not exists (
    select 1 from public.friendships
    where user_id = v_self and friend_id = p_friend_id and status = 'accepted'
  ) then
    raise exception 'You can only invite accepted friends';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_friend_id
  ) then
    raise exception 'That person has already joined this challenge';
  end if;

  insert into public.challenge_invites (challenge_id, invited_user_id, invited_by)
    values (p_challenge_id, p_friend_id, v_self)
    on conflict (challenge_id, invited_user_id) do nothing;
end;
$$;

grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. respond_to_challenge_invite — accept joins (re-checking the window is
--    still open, since this bypasses the RLS policy that would otherwise
--    enforce it) or decline; either way the invite row is consumed.
-- ---------------------------------------------------------------------------
create or replace function public.respond_to_challenge_invite(p_challenge_id uuid, p_accept boolean)
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

  if not exists (
    select 1 from public.challenge_invites
    where challenge_id = p_challenge_id and invited_user_id = v_self
  ) then
    raise exception 'No pending invite for that challenge';
  end if;

  if p_accept then
    if not public.challenge_window_open(p_challenge_id) then
      raise exception 'This challenge has already ended';
    end if;

    insert into public.challenge_participants (challenge_id, user_id, progress)
      values (p_challenge_id, v_self, 0)
      on conflict (challenge_id, user_id) do nothing;
  end if;

  delete from public.challenge_invites
    where challenge_id = p_challenge_id and invited_user_id = v_self;
end;
$$;

grant execute on function public.respond_to_challenge_invite(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. create_challenge — add p_visibility. Signature is changing (a 6th
--     trailing parameter), so per the same trap 0015 hit adding p_starts_at,
--     the previous 5-argument version must be dropped explicitly first or
--     Postgres will add a third overload instead of truly replacing it.
-- ---------------------------------------------------------------------------
drop function if exists public.create_challenge(text, text, numeric, integer, date);

create or replace function public.create_challenge(
  p_title text,
  p_goal_type text,
  p_goal_value numeric,
  p_duration_days integer,
  p_starts_at date default current_date,
  p_visibility text default 'public'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
  v_challenge_id uuid;
begin
  if v_self is null then
    raise exception 'Not signed in';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Title is required';
  end if;

  if p_goal_type not in ('stepsPerDay', 'totalSteps', 'daysStreak') then
    raise exception 'Invalid goal type';
  end if;

  if p_goal_value is null or p_goal_value <= 0 then
    raise exception 'Goal value must be greater than zero';
  end if;

  if p_duration_days is null or p_duration_days <= 0 then
    raise exception 'Duration must be at least 1 day';
  end if;

  if p_starts_at is null or p_starts_at < current_date then
    raise exception 'Start date can''t be in the past';
  end if;

  if p_visibility not in ('public', 'invite_only') then
    raise exception 'Invalid visibility';
  end if;

  insert into public.challenges (title, goal_type, goal_value, duration_days, created_by, starts_at, visibility)
    values (trim(p_title), p_goal_type, p_goal_value, p_duration_days, v_self, p_starts_at, p_visibility)
    returning id into v_challenge_id;

  insert into public.challenge_participants (challenge_id, user_id, progress)
    values (v_challenge_id, v_self, 0);

  return v_challenge_id;
end;
$$;

grant execute on function public.create_challenge(text, text, numeric, integer, date, text) to authenticated;
