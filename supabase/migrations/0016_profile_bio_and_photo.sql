-- Profile customization: bio + photo (issue: profile personalization
-- follow-up to the challenge detail / scheduled challenges work).
--
-- Adds a short free-text bio and an optional avatar photo. `avatar_url` sits
-- alongside the existing `avatar_color` (0001_init.sql) rather than
-- replacing it — color stays as the fallback for the initials circle
-- (see app-mobile/components/Avatar.tsx) whenever no photo has been set.
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0015_scheduled_challenges.sql.

alter table public.profiles
  add column bio text,
  add column avatar_url text;

alter table public.profiles
  add constraint profiles_bio_length check (bio is null or length(bio) <= 160);

comment on column public.profiles.bio is 'Optional free-text About Me, capped at 160 chars.';
comment on column public.profiles.avatar_url is 'Public URL of the uploaded avatar photo (storage bucket "avatars"), if set. Falls back to the colored-initials Avatar when null.';

-- ---------------------------------------------------------------------------
-- Storage: an "avatars" bucket for profile photos. New territory for this
-- project (no prior migration has touched `storage.*`), but
-- `storage.buckets`/`storage.objects` are ordinary Postgres tables in
-- Supabase's own `storage` schema, so a normal migration can manage them the
-- same way as any other table.
--
-- Public bucket + public select policy: an avatar photo isn't sensitive
-- data, and this avoids needing signed URLs — consistent with
-- `display_name`/`avatar_color` already being open to any authenticated
-- user (0001_init.sql). Write access (insert/update/delete) is scoped to
-- the caller's own folder via the standard Supabase Storage RLS pattern:
-- object paths are `{user_id}/avatar.jpg`, and `storage.foldername(name)`
-- splits that path so `[1]` is the first segment (the user id).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users manage their own avatar file"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
