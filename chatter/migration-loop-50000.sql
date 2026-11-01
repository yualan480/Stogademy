-- Orbit Loop: it is bought from the Orbit Shop (not the Leaderboard), and the price floor is now 50,000 Orbits.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run. Run it after migration-orbit-game-v2.sql.
-- A buyer must pay MORE than 50,000, and more than the latest price paid if that is higher (so at least 50,001, or latest + 1).
update public.orbit_loop set start_price = 50000 where id = 1;

create or replace function public.take_orbit_loop(p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp orbit_loop; need int;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_price is null or p_price < 1 then raise exception 'Type a price in Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select * into lp from orbit_loop where id = 1 for update;
  if not found then raise exception 'The Orbit Loop is not set up yet.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  need := greatest(lp.start_price, lp.price) + 1;
  if p_price < need then raise exception 'You need to pay more than % Orbits to take the Orbit Loop (at least %).', need - 1, need; end if;
  if game_bal(uid) - game_locked(uid) < p_price then raise exception 'Not enough unlocked Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_price, 'spend', 'loop:' || gen_random_uuid());
  perform _loop_move(uid, 'purchase', p_price);
  return jsonb_build_object('balance', game_bal(uid), 'price', p_price, 'holder', uid);
end $$;
revoke all on function public.take_orbit_loop(int) from public, anon;
grant execute on function public.take_orbit_loop(int) to authenticated;
