-- Run once in the Supabase SQL editor after adding Archery.
-- 1) lets the scores table accept Archery scores (game id: archery)
alter table public.scores drop constraint if exists scores_game_check;
alter table public.scores add constraint scores_game_check check (game = any (array['blockblast','tetris','game2048','snake','pacman','breakout','minesweeper','tycoon','flappy','dino','blockout','slope','geodash','archery']));

-- 2) counts Archery in the MVP total score (same view as geodash-setup.sql, with 'archery' added to the game list)
drop view if exists public.player_mvp_points;
create view public.player_mvp_points as
with best as (
  select s.game, lower(btrim(s.name)) as k, max(s.score) as score, (array_agg(s.name order by s.created_at desc))[1] as name
  from scores s
  where s.game = any (array['blockblast','tetris','game2048','snake','pacman','breakout','minesweeper','flappy','dino','blockout','slope','geodash','archery'])
    and not exists (select 1 from player_status p where p.name = lower(btrim(s.name)) and p.state in ('banned','suspended') and (p.until is null or p.until > now()))
  group by s.game, lower(btrim(s.name))
),
base as (select k, (array_agg(name order by score desc))[1] as name, sum(score)::bigint as total, (count(*) filter (where score > 0))::integer as games from best group by k),
adj as (select lower(btrim(name)) as k, max(name) as name, sum(delta)::bigint as d from mvp_adjustments group by 1)
select coalesce(b.k, a.k) as key, coalesce(b.name, a.name) as name, (coalesce(b.total,0)+coalesce(a.d,0))::bigint as total, coalesce(b.games,0)::integer as games
from base b full join adj a on a.k = b.k;
grant select on public.player_mvp_points to anon, authenticated;
