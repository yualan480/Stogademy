-- Orbit Leaderboard: "Change" column now shows how many PLACES someone rose or dropped, and adds an All-time view.
-- Run once in Supabase SQL Editor (after migration-orbits-unified.sql). Safe to re-run.
--   p_days = 1 / 7 / 30  -> this day / week / month, compared with the period right before it
--   p_days = 0           -> all-time, compared with the all-time standings 7 days ago
-- prev_rank is null when the person was not on the board before (shown as NEW).
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_rank bigint)
language sql stable security definer set search_path = public as $$
  with cur as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l
     where l.amount > 0 and (p_days <= 0 or l.created_at >= now() - make_interval(days => p_days))
     group by l.user_id),
  prv as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l
     where l.amount > 0
       and case when p_days <= 0 then l.created_at < now() - interval '7 days'
                else l.created_at >= now() - make_interval(days => 2 * p_days) and l.created_at < now() - make_interval(days => p_days) end
     group by l.user_id),
  prv_r as (select user_id, rank() over (order by t desc) as r from prv)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, prv_r.r
    from cur join profiles p on p.id = cur.user_id left join prv_r on prv_r.user_id = cur.user_id
   order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;
