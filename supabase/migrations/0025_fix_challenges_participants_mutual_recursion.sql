-- 0024 fixed challenge_participants' self-referencing subquery, but that
-- wasn't the whole problem — confirmed live by "infinite recursion detected
-- in policy for relation" errors on BOTH challenges and
-- challenge_participants after 0024 was applied.
--
-- The real issue: challenges' SELECT policy queries challenge_participants
-- (to check "am I a participant"), and challenge_participants' SELECT
-- policy queries challenges (to check "is this challenge public or did I
-- create it"). Evaluating either policy requires evaluating the other,
-- which requires evaluating the first again — a genuine circular
-- dependency between the two tables' RLS policies, distinct from (and
-- bigger than) 0024's single self-reference bug.
--
-- Fixed by routing BOTH cross-table checks through security-definer helper
-- functions, which bypass RLS on their own internal queries — the same
-- principle 0024 already applied to challenge_participants' self-
-- reference (is_fellow_participant, kept as-is here), now also applied to
-- challenges' reference into challenge_participants, and to
-- challenge_participants' reference into challenges. This fully decouples
-- both policies from ever triggering each other's RLS evaluation, not just
-- the one instance that happened to be caught first.
--
-- (challenge_invites' SELECT policy — used by challenges' 4th clause — is
-- a simple auth.uid() = invited_user_id or invited_by check with no
-- subquery into another RLS-protected table, so it isn't part of this
-- cycle and needs no change.)
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0024_fix_challenge_participants_visibility.sql.

create or replace function public.can_view_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenges
    where id = p_challenge_id and (visibility = 'public' or created_by = auth.uid())
  );
$$;

drop policy if exists "challenges are readable by any authenticated user" on public.challenges;

create policy "challenges are readable by any authenticated user"
  on public.challenges for select
  to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or public.is_fellow_participant(id)
    or exists (
      select 1 from public.challenge_invites ci
      where ci.challenge_id = id and ci.invited_user_id = auth.uid()
    )
  );

drop policy if exists "participants are readable by any authenticated user" on public.challenge_participants;

create policy "participants are readable by any authenticated user"
  on public.challenge_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.can_view_challenge(challenge_id)
    or public.is_fellow_participant(challenge_id)
  );
