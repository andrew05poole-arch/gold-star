-- Self-service account deletion (Apple App Store Guideline 5.1.1(v): any app
-- with account creation must offer in-app account deletion).
--
-- Design shaped by an independent validation pass around one real platform
-- constraint: on current hosted Supabase, auth.users is owned by
-- supabase_auth_admin and storage.objects by supabase_storage_admin, and a
-- postgres-owned security-definer function very likely does NOT hold DELETE
-- on them. So this RPC does NOT try to be clever:
--
--   * App data — the guaranteed part. `delete from public.profiles` (postgres
--     owns public.*) cascades to all 17 app tables (step_records, streaks,
--     friendships×2, challenge_participants, rival_profiles, activity_events/
--     reactions/comments/reshares, follows×2, challenge_invites×2,
--     challenge_placements, points_transactions). This ALWAYS runs.
--   * The auth.users row — best-effort. Attempted, but only an
--     insufficient_privilege (42501) error is swallowed, so all personal/
--     health data is purged regardless of whether the platform grants the
--     auth-row delete. Any OTHER error propagates and rolls the whole
--     function back (one implicit transaction) so we never half-delete.
--   * Avatar storage objects are NOT handled here — the cascade doesn't touch
--     storage.objects, and a raw `delete from storage.objects` would leak the
--     underlying blob AND likely hit the same ownership wall. The client
--     removes them via the storage API under its own per-user RLS (0016)
--     BEFORE calling this RPC — see deleteAccount() in lib/api/profile.ts.
--
-- Two outcomes:
--   * If postgres has DELETE on auth.users → full deletion (data + login row).
--   * If not → all data purged; a bare auth.users login shell remains. On the
--     user's next sign-in, app/index.tsx finds no profiles row and routes them
--     to onboarding as a fresh user. This is a defensible MVP stance; the bare
--     shell can be reaped later by an Auth Admin API edge function (service
--     role), the standard full-deletion path once edge functions exist.
--
-- To check which outcome applies on your project, run in the SQL editor:
--   select has_table_privilege('postgres', 'auth.users', 'delete');
--
-- The one non-cascade FK: challenges.created_by has no on-delete rule
-- (defaults to `no action`, 0001_init.sql:245) and would BLOCK the profiles
-- delete. It's nullable, so step 1 nulls it — challenges the departing user
-- created survive for their other participants (mirrors 0026's
-- points_transactions.challenge_id on-delete-set-null precedent).
--
-- Takes NO parameter — only ever acts on auth.uid(), so a signed-in caller
-- can only ever delete themselves (matches send_friend_request /
-- finalize_challenge_placements etc.). Run once after 0026.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  -- 1. Clear the one non-cascade FK so the profiles delete isn't blocked, and
  --    so this user's created challenges survive for their other participants.
  update public.challenges set created_by = null where created_by = v_uid;

  -- 2. Guaranteed app-data purge — cascades to every table referencing
  --    profiles(id) on delete cascade.
  delete from public.profiles where id = v_uid;

  -- 3. Best-effort removal of the auth login row. Swallow ONLY a
  --    permission error (expected on hosted Supabase); let anything else
  --    propagate so an unexpected failure rolls back the whole deletion.
  begin
    delete from auth.users where id = v_uid;
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

grant execute on function public.delete_account() to authenticated;
