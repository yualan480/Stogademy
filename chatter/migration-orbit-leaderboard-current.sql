-- Orbit Leaderboard: adds a "Current" view and keeps All-time. Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run.
--   p_days = 1 / 7 / 30 -> Orbits EARNED this day / week / month, compared with the period right before it
--   p_days = 0          -> All-time: every Orbit ever EARNED (spending never lowers it)
--   p_days = -1         -> Current: the Orbits a member HAS right now (earned minus spent)
-- prev_rank is where the member stood before (null = new on the board). For All-time and Current it is their
-- standing 7 days ago.
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_rank bigint)
language sql stable security definer set search_path = public as $$
  with m as (select coalesce(p_days, 1) as d),
  cur as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then true
                when m.d = 0 then l.amount > 0
                else l.amount > 0 and l.created_at >= now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then l.created_at < now() - interval '7 days'
                when m.d = 0 then l.amount > 0 and l.created_at < now() - interval '7 days'
                else l.amount > 0 and l.created_at >= now() - make_interval(days => 2 * m.d) and l.created_at < now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv_r as (select user_id, rank() over (order by t desc) as r from prv)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, prv_r.r
    from cur join profiles p on p.id = cur.user_id left join prv_r on prv_r.user_id = cur.user_id
   order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;
