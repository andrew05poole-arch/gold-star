-- Fixes a real bug in 0020_challenge_visibility_invites.sql's "participants
-- are readable by any authenticated user" policy on challenge_participants.
--
-- The third OR-clause was meant to let a fellow participant of the SAME
-- challenge see the full member list (needed for invite-only challenges,
-- since the clause above it only covers public challenges / the creator).
-- It read:
--
--   exists (
--     select 1 from public.challenge_participants cp2
--     where cp2.challenge_id = challenge_id and cp2.user_id = auth.uid()
--   )
--
-- The bare `challenge_id` on the right-hand side was meant to correlate to
-- the OUTER row being tested by the policy, but because the subquery's own
-- FROM list (aliased cp2) also has a `challenge_id` column, Postgres's
-- normal scoping rules bound it to `cp2.challenge_id` instead — producing
-- `cp2.challenge_id = cp2.challenge_id`, a self-referential tautology,
-- confirmed live via `select qual from pg_policies where policyname =
-- 'participants are readable by any authenticated user'`.
--
-- Beyond being logically wrong, a raw subquery selecting FROM the same
-- table an RLS policy protects is exactly the pattern this codebase has
-- otherwise always avoided (see 0008_activity_events.sql's and 0011_
-- activity_reactions.sql's header comments on why friend-scoped reads
-- route through security-definer RPCs instead of a raw "friends can
-- select" policy) — Postgres has to re-apply the SAME policy to filter the
-- subquery's own rows. This is almost certainly what actually made every
-- challenge disappear from the app entirely (not just return wrong
-- results): getChallenges() fires two parallel queries, and the second
-- (against challenge_participant_status, which reads
-- challenge_participants) very likely errored outright, failing the whole
-- Promise.all — silently swallowed by refreshChallenges()'s
-- .catch(() => {}), leaving the screen empty even though the challenges
-- were sitting right there in the table.
--
-- Fixed the same way challenge_window_open already sidesteps this for the
-- challenge_participants INSERT/UPDATE policies in 0020: a small security-
-- definer helper function. Being security definer, its own internal query
-- against challenge_participants bypasses RLS entirely, so there's no
-- self-referencing policy evaluation for Postgres to worry about.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0023_activity_reshares.sql.

create or replace function public.is_fellow_participant(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  );
$$;

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
    or public.is_fellow_participant(challenge_id)
  );
