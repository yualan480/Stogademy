-- Orbit Leaderboard: adds the "Change" column (this period vs the period before it). Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_total bigint)
language sql stable security definer set search_path = public as $$
  with w as (select greatest(p_days, 1) as d),
  cur as (select l.user_id, sum(l.amount)::bigint as t from orbit_ledger l, w where l.created_at >= now() - make_interval(days => w.d) group by l.user_id),
  prv as (select l.user_id, sum(l.amount)::bigint as t from orbit_ledger l, w where l.created_at >= now() - make_interval(days => 2 * w.d) and l.created_at < now() - make_interval(days => w.d) group by l.user_id)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, coalesce(prv.t, 0)::bigint
  from cur join profiles p on p.id = cur.user_id left join prv on prv.user_id = cur.user_id
  order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;
