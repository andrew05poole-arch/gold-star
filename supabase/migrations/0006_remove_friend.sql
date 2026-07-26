-- Remove-friend action (issue #11, P2).
--
-- Once a friendship exists (mirrored directional 'accepted' rows between two
-- users — see 0004_friend_requests.sql), there was previously no way to undo
-- it. This migration adds `remove_friend(p_friend_id)`, which deletes both
-- directional 'accepted' rows between the calling user and the target,
-- scoped to auth.uid() (security definer, same pattern as
-- respond_to_friend_request).
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0005_referral_codes.sql / 0005_challenge_completion.sql.

create or replace function public.remove_friend(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_self uuid := auth.uid();
begin
  if p_friend_id = v_self then
    raise exception 'You cannot remove yourself as a friend';
  end if;

  delete from public.friendships
    where status = 'accepted'
      and ((user_id = v_self and friend_id = p_friend_id)
        or (user_id = p_friend_id and friend_id = v_self));
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: allow either side of an accepted friendship to delete their own
-- directional row (mirrors the existing "recipients can delete pending
-- requests sent to them" policy from 0004_friend_requests.sql). The RPC
-- above is `security definer` so it doesn't strictly need this policy to
-- function, but it's added for defense in depth / direct-table access
-- parity.
-- ---------------------------------------------------------------------------
create policy "users delete their own side of an accepted friendship"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id and status = 'accepted');
