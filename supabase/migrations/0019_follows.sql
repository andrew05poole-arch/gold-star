-- Follow (issue: profile personalization roadmap, "follow people who excel
-- or are celebrity").
--
-- Deliberately separate from `friendships` (0001_init.sql/0004_friend_requests.sql),
-- not a replacement for it. Friendship stays mutual and approval-gated (it
-- drives the private friends leaderboard); follow is one-directional with
-- no approval step, matching Instagram's model — for watching someone's
-- public profile without needing them to accept anything.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0018_public_profile_streaks.sql.

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

alter table public.follows enable row level security;

-- Follows are public info (mirrors `profiles`/`challenge_participant_status`
-- already being open-read) — who follows whom isn't sensitive, and a
-- follower count is the whole point of the feature.
create policy "follows are readable by any authenticated user"
  on public.follows for select
  to authenticated
  using (true);

create policy "users follow as themselves"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "users unfollow their own follows"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

-- No update policy: following is binary (a row exists or it doesn't), same
-- as challenge_participants' join/leave model — never a boolean flag to flip.
