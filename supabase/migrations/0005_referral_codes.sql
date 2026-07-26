-- Shareable invite link/code (issue #7, P0).
--
-- Adds a short, unique, human-typeable `referral_code` to every profile and
-- an `add_friend_by_referral_code` RPC so a not-yet-registered user can be
-- invited via a code (shared through the native Share sheet) instead of
-- needing to know the inviter's exact email. A real deep link isn't needed
-- for MVP — the invitee types the code in during onboarding, which sends the
-- inviter a pending friend request through the same request/accept flow
-- introduced in 0004_friend_requests.sql.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0004_friend_requests.sql.

-- ---------------------------------------------------------------------------
-- referral_code: short (8-char) uppercase base32-ish code, unique per user.
-- Backfilled for existing rows, generated going forward by a trigger so
-- callers never have to supply one on insert.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column referral_code text;

-- Generates an 8-character code from a safe alphabet (no 0/O/1/I) with a
-- retry loop to guarantee uniqueness even under (extremely unlikely)
-- collisions.
create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet) + 1)::int, 1);
    end loop;

    select exists(select 1 from public.profiles where referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;

  return v_code;
end;
$$;

create or replace function public.trg_set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

create trigger trg_profiles_set_referral_code
  before insert on public.profiles
  for each row execute function public.trg_set_referral_code();

-- Backfill existing rows.
update public.profiles set referral_code = public.generate_referral_code() where referral_code is null;

alter table public.profiles
  alter column referral_code set not null,
  add constraint profiles_referral_code_key unique (referral_code);

-- ---------------------------------------------------------------------------
-- Send a friend request by referral code — same semantics as
-- add_friend_by_email (0004_friend_requests.sql), just looked up by code
-- instead of auth email. Used by onboarding when a new user enters an
-- invite code they received via the Share sheet.
-- ---------------------------------------------------------------------------
create or replace function public.add_friend_by_referral_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_friend_id uuid;
  v_self uuid := auth.uid();
  v_existing_status text;
begin
  select id into v_friend_id from public.profiles where referral_code = upper(trim(p_code));

  if v_friend_id is null then
    raise exception 'No StepLeague user found with that invite code';
  end if;

  if v_friend_id = v_self then
    raise exception 'You cannot add yourself as a friend';
  end if;

  select status into v_existing_status
    from public.friendships
    where (user_id = v_self and friend_id = v_friend_id)
       or (user_id = v_friend_id and friend_id = v_self)
    limit 1;

  if v_existing_status = 'accepted' then
    return;
  end if;

  -- The other user already requested us — accept it instead of creating a
  -- second, redundant pending row in the opposite direction.
  if exists (
    select 1 from public.friendships
    where user_id = v_friend_id and friend_id = v_self and status = 'pending'
  ) then
    perform public.respond_to_friend_request(v_friend_id, true);
    return;
  end if;

  insert into public.friendships (user_id, friend_id, status)
    values (v_self, v_friend_id, 'pending')
    on conflict (user_id, friend_id) do update set status = 'pending';
end;
$$;
