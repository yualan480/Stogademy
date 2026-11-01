-- Run once in the Supabase SQL editor.
-- The MVP is now chosen by TOTAL SCORE: each player's best score in every game, added up
-- (instead of placement points: 100 for 1st, 95 for 2nd ... 55 for 10th).
-- Admin "Adjust MVP" changes (mvp_adjustments) are still added on top. Banned/suspended players are still excluded.
-- Note: this REPLACES the view from admin-setup.sql / slope-setup.sql, so don't re-run those two afterwards.
-- The column is bigint now (sums of big scores can pass the integer limit), so the old view is dropped first.
drop view if exists public.player_mvp_points;
create view public.player_mvp_points as
with best as (
  select s.game, lower(btrim(s.name)) as k, max(s.score) as score, (array_agg(s.name order by s.created_at desc))[1] as name
  from scores s
  where s.game = any (array['blockblast','tetris','game2048','snake','pacman','breakout','minesweeper','flappy','dino','blockout','slope','geodash'])
    and not exists (select 1 from player_status p where p.name = lower(btrim(s.name)) and p.state in ('banned','suspended') and (p.until is null or p.until > now()))
  group by s.game, lower(btrim(s.name))
),
base as (select k, (array_agg(name order by score desc))[1] as name, sum(score)::bigint as total, (count(*) filter (where score > 0))::integer as games from best group by k),
adj as (select lower(btrim(name)) as k, max(name) as name, sum(delta)::bigint as d from mvp_adjustments group by 1)
select coalesce(b.k, a.k) as key, coalesce(b.name, a.name) as name, (coalesce(b.total,0)+coalesce(a.d,0))::bigint as total, coalesce(b.games,0)::integer as games
from base b full join adj a on a.k = b.k;
grant select on public.player_mvp_points to anon, authenticated;
