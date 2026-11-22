-- Step plausibility guard (anti-cheat, basic) — issue #86.
--
-- Problem: step values flowed straight into `step_records` with no bound. With
-- weekly/geo leaderboards, challenges, placements, points and World Rank all
-- live, a single fabricated step count could win every competitive surface,
-- because every one of them derives from `raw_steps`/`normalized_steps`.
--
-- This migration adds a server-side guard — the only enforcement point a client
-- cannot bypass (the app's own write path is advisory; a raw API call is not).
-- It is deliberately the "basic version" the issue asks for: a sane per-day
-- ceiling + flagging, not device attestation or behavioural fraud detection.
--
-- Three parts:
--   1. CLAMP at the source. A BEFORE trigger caps `raw_steps` into a plausible
--      range. Because every downstream surface (leaderboard view, challenge
--      progress, streaks, rival target, placements/points) reads from the
--      stored `raw_steps`/`normalized_steps`, clamping once here bounds the
--      damage everywhere at once — no per-surface change needed.
--   2. FLAG the offending rows. A clamped row records its originally-submitted
--      value and a reason, so the attempt is auditable, and is EXCLUDED from
--      the shared weekly leaderboard (mirrors how 0013 excludes
--      `is_historical_import` rows — same single-enforcement-point pattern).
--   3. CLOSE the normalized-steps injection hole. The normalizer trigger
--      (0001_init.sql) only fired `of raw_steps`, so an UPDATE that set
--      `normalized_steps` directly — without touching `raw_steps` — bypassed it
--      and persisted an arbitrary score (RLS lets a user update their own
--      rows). We re-point that trigger to fire on EVERY insert/update, so
--      `normalized_steps` is always recomputed server-side from the (clamped)
--      `raw_steps` and a client-supplied value is always overwritten.
--
-- Scope notes (what this does and does not guard, by design):
--   - Weekly leaderboard (all scopes: friends/city/country/global) read through
--     `leaderboard_week_scores`, so excluding flagged rows there covers them
--     all, exactly as 0013's header describes for historical rows.
--   - Challenges / streaks / placements / points still COUNT a flagged day, but
--     only at the clamped ceiling value, never the fabricated one — the cap, not
--     full exclusion, bounds those for now. Fully excluding flagged days from
--     challenge progress is a Phase-2 follow-up (it would mean editing
--     `recompute_challenge_progress`, last revised in 0026); the ceiling keeps
--     this change small and low-risk while removing the unbounded exploit.
--   - `MAX_PLAUSIBLE_DAILY_STEPS` (100000) is a documented, tunable placeholder.
--     A marathon is ~50k steps and an ultramarathon ~70-90k, so 100k clears any
--     realistic human day while blocking obvious fabrication. Raise it if a real
--     ultra-athlete is ever legitimately flagged.
--   - Phase-2 ideas intentionally omitted here: day-over-day spike detection,
--     per-source calibration, and rate/velocity checks (all risk false
--     positives and need real data to tune — see PRD §12).
--
-- Run once in the Supabase SQL editor (or via `supabase db push`) after
-- 0027_delete_account.sql.

-- ---------------------------------------------------------------------------
-- 1. Provenance columns for a flagged (clamped) row.
--    `is_flagged` is the single source of truth for "was this row clamped as
--    implausible?" — the leaderboard view filters on it. `submitted_raw_steps`
--    keeps the original value for audit/troubleshooting (null when not clamped);
--    `flagged_reason` says which bound was hit.
-- ---------------------------------------------------------------------------
alter table public.step_records
  add column is_flagged boolean not null default false,
  add column flagged_reason text,
  add column submitted_raw_steps integer;

comment on column public.step_records.is_flagged is
  'True when enforce_step_plausibility() clamped an implausible raw_steps value. Excluded from leaderboard_week_scores — see migration 0028''s header comment.';
comment on column public.step_records.submitted_raw_steps is
  'The originally-submitted raw_steps before clamping (null unless is_flagged). Audit/troubleshooting only; read by no scoring logic.';

-- ---------------------------------------------------------------------------
-- 2. Clamp + flag. Runs BEFORE the normalizer so normalization sees the
--    clamped value. Postgres fires BEFORE ROW triggers in trigger-name order,
--    and 'trg_clamp_step_plausibility' < 'trg_compute_normalized_steps'
--    ('l' < 'o'), so this is guaranteed to run first — do not rename either
--    without preserving that order.
--
--    Scoped to `of raw_steps` on purpose: the flag must only be re-evaluated
--    when raw_steps actually changes, so an unrelated UPDATE (e.g. setting
--    is_historical_import) can never silently clear a prior flag.
--    Client-supplied is_flagged/submitted_raw_steps are ignored — this trigger
--    sets them unconditionally from raw_steps, so the guard can't be spoofed.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_step_plausibility()
returns trigger
language plpgsql
as $$
declare
  v_max constant integer := 100000; -- MAX_PLAUSIBLE_DAILY_STEPS (tunable; see header)
begin
  if new.raw_steps < 0 then
    new.submitted_raw_steps := new.raw_steps;
    new.raw_steps := 0;
    new.is_flagged := true;
    new.flagged_reason := 'negative_steps';
  elsif new.raw_steps > v_max then
    new.submitted_raw_steps := new.raw_steps;
    new.raw_steps := v_max;
    new.is_flagged := true;
    new.flagged_reason := 'exceeds_daily_max';
  else
    -- Plausible value: clear any prior flag state (covers a corrected re-upsert).
    new.submitted_raw_steps := null;
    new.is_flagged := false;
    new.flagged_reason := null;
  end if;
  return new;
end;
$$;

create trigger trg_clamp_step_plausibility
  before insert or update of raw_steps on public.step_records
  for each row execute function public.enforce_step_plausibility();

-- ---------------------------------------------------------------------------
-- 3. Close the normalized_steps injection hole. The original normalizer trigger
--    (0001_init.sql) fired only `of raw_steps`; re-point it to every
--    insert/update so normalized_steps is always derived server-side from the
--    clamped raw_steps and a directly-written value can never persist. The
--    function itself (compute_normalized_steps) is unchanged and idempotent.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_compute_normalized_steps on public.step_records;

create trigger trg_compute_normalized_steps
  before insert or update on public.step_records
  for each row execute function public.compute_normalized_steps();

-- ---------------------------------------------------------------------------
-- 4. Re-declare leaderboard_week_scores (latest definition: 0013) to also
--    exclude flagged rows. Single centralized enforcement point: every
--    leaderboard scope reads scores only through this view.
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_week_scores as
select
  user_id,
  date_trunc('week', date::timestamp at time zone 'UTC')::date as week_id,
  sum(normalized_steps) as normalized_score
from public.step_records
where not is_historical_import
  and not is_flagged
group by user_id, date_trunc('week', date::timestamp at time zone 'UTC');
