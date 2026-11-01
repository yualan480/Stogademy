-- Run ONCE in the ORBIT Supabase project (the one with orbit_ledger, NOT the games project):
-- SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- The games MVP is now whoever has the most Orbits RIGHT NOW. This adds up everything in orbit_ledger
-- (earned AND spent), so spending Orbits in the Prize Room lowers a player's place.
-- It only hands out display names and balances (top 10 at most), so the games page can show it to everyone.
create or replace function public.orbit_mvp(p_limit int default 10)
returns table (display_name text, total bigint)
language sql stable security definer set search_path = public as $$
  select p.display_name, sum(l.amount)::bigint as total
  from orbit_ledger l join profiles p on p.id = l.user_id
  group by p.id, p.display_name
  having sum(l.amount) > 0
  order by 2 desc, 1 asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25) $$;
revoke all on function public.orbit_mvp(int) from public;
grant execute on function public.orbit_mvp(int) to anon, authenticated;
