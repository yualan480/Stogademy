-- Orbit Gamble: the extra-try fee against the Orbit Bot drops from 1,000 to 500 Orbits.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run. Run it after migration-gamble.sql.
-- The 3 free hands a day are unchanged. After them, each extra hand costs 500 Orbits on top of the bet. Players tables stay free.
-- The fee is charged by the server, so the page can't change it.

create or replace function public.bj_bot_start(p_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.gamble_day(); used int; fee int := 0; bal bigint; g bj_games; dk int[];
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_bet is null or p_bet < 10 or p_bet > 5000 then raise exception 'Bets are 10 to 5,000 Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if exists (select 1 from bj_games where user_id = uid and status = 'active') then raise exception 'Finish your current hand first.'; end if;
  insert into gamble_daily (user_id, day, tries) values (uid, d, 0) on conflict do nothing;
  select tries into used from gamble_daily where user_id = uid and day = d for update;
  if used >= 3 then fee := 500; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_bet + fee then
    raise exception '%', case when fee > 0 then 'Extra tries cost 500 Orbits plus your bet. You need ' || to_char(p_bet + fee, 'FM999,999') || ' Orbits.' else 'Not enough Orbits.' end;
  end if;
  update gamble_daily set tries = tries + 1 where user_id = uid and day = d;
  if fee > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -fee, 'gamble_fee', 'bjfee:' || gen_random_uuid()); end if;
  dk := public.bj_shuffle();
  insert into bj_games (user_id, bet, deck, player, dealer)
    values (uid, p_bet, dk[5:], array[dk[1], dk[3]], array[dk[2], dk[4]]) returning * into g;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_bet, 'gamble_bet', 'bj:' || g.id);
  -- a natural 21 for either side ends the hand straight away
  if public.bj_total(g.player) = 21 or public.bj_total(g.dealer) = 21 then g := public.bj_bot_finish(g, false); end if;
  return jsonb_build_object('game', public.bj_view(g), 'balance', bal - p_bet - fee, 'fee', fee, 'tries', used + 1);
end $$;
revoke all on function public.bj_bot_start(int) from public, anon;
grant execute on function public.bj_bot_start(int) to authenticated;

create or replace function public.gamble_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); d date := public.gamble_day(); used int := 0; g bj_games; p bj_pvp; net bigint; r bj_pvp;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform public.bj_pvp_expire();
  for r in select * from bj_pvp where status = 'playing' and (host = uid or guest = uid) for update loop perform public.bj_pvp_tick(r); end loop;
  select tries into used from gamble_daily where user_id = uid and day = d;
  select * into g from bj_games where user_id = uid and status = 'active';
  select * into p from bj_pvp where status in ('open', 'playing') and (host = uid or guest = uid) order by created_at desc limit 1;
  select coalesce(sum(amount), 0) into net from orbit_ledger
    where user_id = uid and reason in ('gamble_bet', 'gamble_fee', 'gamble_win') and created_at >= (d::timestamp at time zone 'utc');
  return jsonb_build_object(
    'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid),
    'free_per_day', 3, 'tries_used', coalesce(used, 0), 'free_left', greatest(0, 3 - coalesce(used, 0)), 'extra_cost', 500,
    'resets_in', greatest(0, ceil(extract(epoch from ((d + 1)::timestamp at time zone 'utc' - now()))))::int,
    'today_net', net, 'min_bet', 10, 'max_bet', 5000,
    'bot_game', case when g.id is null then null else public.bj_view(g) end,
    'pvp_game', case when p.id is null then null else public.bj_pvp_view(p, uid) end);
end $$;
revoke all on function public.gamble_status() from public, anon;
grant execute on function public.gamble_status() to authenticated;
