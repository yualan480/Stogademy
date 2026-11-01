-- Run ONCE in the Supabase SQL editor. Cuts every score on every leaderboard in half (rounded down, never below 1).
-- It first saves a copy of the whole scores table, so it can be undone. If you run it a second time it stops with an
-- error ("scores_backup_before_halving already exists") and changes nothing, so scores can't be halved twice by accident.
-- The MVP totals are worked out from this table, so they drop automatically.

begin;
select set_config('app.bulk', '1', true);   -- keeps the audit trigger from writing one log row per score

create table public.scores_backup_before_halving as select * from public.scores;

update public.scores set score = greatest(1, floor(score / 2.0))::bigint;

commit;

-- To undo (only if you need to):
--   update public.scores s set score = b.score from public.scores_backup_before_halving b where b.id = s.id;
-- When you are happy with the result you can drop the copy:
--   drop table public.scores_backup_before_halving;
