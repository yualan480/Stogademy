-- Run once in the Supabase SQL editor after adding Slope.
-- 1) lets the admin panel switch Slope on/off, rename it and reorder it
insert into games_config(id,title,page,sort_order)
values ('slope','Slope','slope.html',13)
on conflict do nothing;

-- 2) counts Slope in the MVP points (same view as admin-setup.sql, with 'slope' added to the game list)
create or replace view public.player_mvp_points as
with best as (
  select s.game, lower(btrim(s.name)) as k, max(s.score) as score, (array_agg(s.name order by s.created_at desc))[1] as name
  from scores s
  where s.game = any (array['blockblast','tetris','game2048','snake','pacman','breakout','minesweeper','flappy','dino','blockout','slope'])
    and not exists (select 1 from player_status p where p.name = lower(btrim(s.name)) and p.state in ('banned','suspended') and (p.until is null or p.until > now()))
  group by s.game, lower(btrim(s.name))
), ranked as (select b.game, b.k, b.score, b.name, rank() over (partition by b.game order by b.score desc) as place from best b),
pts as (select r.game, r.k, r.score, r.name, r.place, case when r.place <= 10 then 105 - 5 * r.place else 0::bigint end as points from ranked r),
base as (select k, (array_agg(name order by points desc, score desc))[1] as name, sum(points)::integer as total, (count(*) filter (where points > 0))::integer as games from pts group by k),
adj as (select lower(btrim(name)) as k, max(name) as name, sum(delta)::integer as d from mvp_adjustments group by 1)
select coalesce(b.k, a.k) as key, coalesce(b.name, a.name) as name, (coalesce(b.total,0)+coalesce(a.d,0))::integer as total, coalesce(b.games,0)::integer as games
from base b full join adj a on a.k = b.k;
grant select on public.player_mvp_points to anon, authenticated;
