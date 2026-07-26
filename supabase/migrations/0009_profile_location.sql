-- [Geo 1/3] Add optional, self-reported location fields to profiles.
-- GPS/device location is deferred (docs/PRD.md §10); city/region/country are
-- entered by the user and back the future city -> national -> global
-- leaderboards. No RLS changes needed: profiles are already readable by any
-- authenticated user and updatable by their owner (0001_init.sql).

alter table public.profiles
  add column city text,
  add column region text,
  add column country text;
