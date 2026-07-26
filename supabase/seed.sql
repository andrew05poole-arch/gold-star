-- Optional: seed a couple of joinable challenge presets so the Streaks
-- screen has real rows to show right after the schema is created. Safe to
-- run multiple times (no-op if titles already exist).
insert into public.challenges (title, subtitle, goal_type, goal_value, duration_days)
select 'Weekend Warrior', '25k steps Sat-Sun', 'totalSteps', 25000, 2
where not exists (select 1 from public.challenges where title = 'Weekend Warrior');

insert into public.challenges (title, subtitle, goal_type, goal_value, duration_days)
select 'Early Bird', '2k steps before 9am, 5 days', 'stepsPerDay', 2000, 5
where not exists (select 1 from public.challenges where title = 'Early Bird');
