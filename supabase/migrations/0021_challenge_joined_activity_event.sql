-- Fixes a dead event type: 'challenge_joined' has been a valid value in
-- activity_events' check constraint since 0008_activity_events.sql, and
-- app-mobile/app/(tabs)/feed.tsx has always had a description/icon case for
-- it, but no trigger, RPC, or client code has ever inserted one — it could
-- never actually appear in a feed. Mirrors trg_friendships_log_friend_added
-- (0008) in being a trigger on the base table rather than editing the RPCs
-- that write to it, so it's robust to every current insertion path
-- (create_challenge's creator self-join, joinChallenge()'s direct upsert for
-- public challenges, respond_to_challenge_invite's accept) without needing
-- to know which one fired: AFTER INSERT only ever sees a genuinely new
-- participation row, since joinChallenge()'s upsert-on-conflict resolves to
-- an UPDATE (not a re-INSERT) for an existing membership.
create or replace function public.trg_challenge_participants_log_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;

  insert into public.activity_events (user_id, event_type, payload)
    values (
      new.user_id,
      'challenge_joined',
      jsonb_build_object('challenge_title', v_title)
    );

  return new;
end;
$$;

create trigger trg_after_challenge_participant_insert_log_joined
  after insert on public.challenge_participants
  for each row execute function public.trg_challenge_participants_log_joined();
