-- Compatibility setup: keep the old filename safe for anyone re-running it.
-- The authoritative rule is also in mvp-cartridge-placements.sql.
-- Orbit Games MVP is earned from a player's best placement in each enabled cartridge.
-- 1st = 100, 2nd = 75, 3rd = 50, 4th = 25, 5th = 10; all lower places = 0.
-- Equal best scores share a rank (RANK, matching the cartridge leaderboards).
-- Historical mvp_adjustments are preserved but no longer affect the MVP.
-- Keep the view's existing key/name/total/games interface for profile cards.
create or replace view public.player_mvp_points as
with best as (
  select
    s.game,
    lower(btrim(s.name)) as k,
    max(s.score) as score,
    (array_agg(btrim(s.name) order by s.created_at desc, s.id desc))[1] as name
  from public.scores s
  join public.games_config g on g.id = s.game and g.enabled = true
  where s.score > 0
    and btrim(s.name) <> ''
    and not exists (
      select 1 from public.player_status p
      where lower(btrim(p.name)) = lower(btrim(s.name))
        and p.state in ('banned', 'suspended')
        and (p.until is null or p.until > now())
    )
  group by s.game, lower(btrim(s.name))
),
placements as (
  select best.*, rank() over (partition by game order by score desc) as place
  from best
)
select
  k as key,
  (array_agg(name order by score desc, game))[1] as name,
  sum(case place
    when 1 then 100
    when 2 then 75
    when 3 then 50
    when 4 then 25
    when 5 then 10
    else 0
  end)::bigint as total,
  count(*)::integer as games
from placements
group by k
having count(*) filter (where place <= 5) > 0;
grant select on public.player_mvp_points to anon, authenticated;
