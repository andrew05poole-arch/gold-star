-- Fixes issue #5: no `rival_profiles` row was ever created for a new user,
-- so `get_rival_target` (0001_init.sql) fell back to its default 1.05x
-- factor for every rival instead of the user's actual `difficulty_band`.
--
-- Follows the same "DB trigger creates a dependent row" convention already
-- used for `streaks` (see `trg_after_step_record_upsert` /
-- `recompute_streak` in 0001_init.sql, which upserts a `streaks` row the
-- first time a user has a qualifying step_record) rather than a client-side
-- sequential insert, so the invariant holds regardless of which client path
-- (or future admin tooling) creates a profile.

-- ---------------------------------------------------------------------------
-- Auto-create a rival_profiles row whenever a profiles row is created.
-- ---------------------------------------------------------------------------
create or replace function public.create_rival_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rival_profiles (user_id, difficulty_band)
  values (new.id, 'even')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger trg_create_rival_profile_after_profile_insert
  after insert on public.profiles
  for each row execute function public.create_rival_profile_for_new_user();

-- Backfill: give any pre-existing profile (created before this migration
-- existed) the same default rival profile, so `get_rival_target` stops
-- relying on its in-query fallback for already-onboarded users.
insert into public.rival_profiles (user_id, difficulty_band)
select p.id, 'even'
from public.profiles p
left join public.rival_profiles rp on rp.user_id = p.id
where rp.user_id is null;
