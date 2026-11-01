-- Orbit Casino: ONE shared daily try counter for every game, 7 free tries a day, then 500 Orbits per extra try.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run. Run it after migration-casino-slots-roulette.sql and migration-gamble-fee-500.sql.
--
-- What counts as a try (resets 00:00 UTC, same counter as before):  a Blackjack hand vs the Orbit Bot, a Slots spin, a Roulette spin.
-- Tries 1 to 7 each day are free. From the 8th on, every try costs 500 Orbits on top of the bet.
-- Blackjack vs other players stays unlimited and free (a player table is not a try).
-- The fee is charged by the server, so the page can't skip or change it.
-- To change the limit or fee later, edit the two one-line functions below and run this file again.

create or replace function public.gamble_free_tries() returns int language sql immutable as $$ select 7 $$;
create or replace function public.gamble_extra_fee() returns int language sql immutable as $$ select 500 $$;
grant execute on function public.gamble_free_tries(), public.gamble_extra_fee() to authenticated;

-- uses one try. Caller must already hold the 'orbit-spend-<uid>' advisory lock. p_cost = the bet, p_avail = Orbits the player may spend.
-- Raises (and so rolls everything back) if the player can't afford bet + fee. Returns the fee charged (0 for a free try) and the new try count.
create or replace function public.gamble_take_try(p_uid uuid, p_cost bigint, p_avail bigint, out fee int, out tries int)
language plpgsql security definer set search_path = public as $$
declare d date := public.gamble_day(); used int;
begin
  insert into gamble_daily (user_id, day, tries) values (p_uid, d, 0) on conflict do nothing;
  select g.tries into used from gamble_daily g where g.user_id = p_uid and g.day = d for update;
  fee := case when used >= public.gamble_free_tries() then public.gamble_extra_fee() else 0 end;
  if p_avail < p_cost + fee then
    raise exception '%', case when fee > 0
      then 'Extra tries cost ' || to_char(fee, 'FM999,999') || ' Orbits plus your bet. You need ' || to_char(p_cost + fee, 'FM999,999') || ' unlocked Orbits.'
      else 'Not enough unlocked Orbits.' end;
  end if;
  update gamble_daily g set tries = g.tries + 1 where g.user_id = p_uid and g.day = d;
  if fee > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (p_uid, -fee, 'gamble_fee', 'gfee:' || gen_random_uuid()); end if;
  tries := used + 1;
end $$;
revoke all on function public.gamble_take_try(uuid, bigint, bigint) from public, anon, authenticated;

-- ───────── Blackjack vs the Orbit Bot ─────────
create or replace function public.bj_bot_start(p_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; g bj_games; dk int[]; t record;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_bet is null or p_bet < 10 or p_bet > 5000 then raise exception 'Bets are 10 to 5,000 Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if exists (select 1 from bj_games where user_id = uid and status = 'active') then raise exception 'Finish your current hand first.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  select * into t from public.gamble_take_try(uid, p_bet, bal);
  dk := public.bj_shuffle();
  insert into bj_games (user_id, bet, deck, player, dealer)
    values (uid, p_bet, dk[5:], array[dk[1], dk[3]], array[dk[2], dk[4]]) returning * into g;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_bet, 'gamble_bet', 'bj:' || g.id);
  -- a natural 21 for either side ends the hand straight away
  if public.bj_total(g.player) = 21 or public.bj_total(g.dealer) = 21 then g := public.bj_bot_finish(g, false); end if;
  return jsonb_build_object('game', public.bj_view(g), 'balance', bal - p_bet - t.fee, 'fee', t.fee, 'tries', t.tries);
end $$;
revoke all on function public.bj_bot_start(int) from public, anon;
grant execute on function public.bj_bot_start(int) to authenticated;

-- ───────── Slots ─────────
create or replace function public.slots_spin(p_bet int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; r int[] := '{}'; v int; s int; run int := 1; mult numeric := 0; pay bigint := 0; rid text := gen_random_uuid()::text; t record;
  tbl numeric[][] := array[[1,4,15,70],[1,5,20,90],[2,8,30,150],[2,15,60,300],[4,30,120,600],[8,60,300,2000]];   -- symbol 0..5, run 2..5
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_bet is null or p_bet < 10 or p_bet > 5000 then raise exception 'Bets are 10 to 5,000 Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  select * into t from public.gamble_take_try(uid, p_bet, bal - public.game_locked(uid));
  for i in 1..5 loop
    v := public.casino_rand(100);
    s := case when v < 28 then 0 when v < 52 then 1 when v < 72 then 2 when v < 86 then 3 when v < 95 then 4 else 5 end;
    r := r || s;
  end loop;
  while run < 5 and r[run + 1] = r[1] loop run := run + 1; end loop;
  if run >= 2 then mult := tbl[r[1] + 1][run - 1]; pay := least(500000, floor(p_bet * mult))::bigint; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_bet, 'gamble_bet', 'slot:' || rid);
  if pay > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (uid, pay, 'gamble_win', 'slot:' || rid); end if;
  return jsonb_build_object('reels', to_jsonb(r), 'run', run, 'symbol', r[1], 'mult', mult, 'bet', p_bet, 'payout', pay, 'net', pay - p_bet,
    'balance', bal - p_bet - t.fee + pay, 'fee', t.fee, 'tries', t.tries);
end $$;
revoke all on function public.slots_spin(int) from public, anon;
grant execute on function public.slots_spin(int) to authenticated;

-- ───────── Roulette ─────────
create or replace function public.roulette_spin(p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; n int; total bigint := 0; pay bigint := 0; b jsonb; t text; v int; a int; ret numeric; won boolean; out jsonb := '[]'::jsonb; rid text := gen_random_uuid()::text; tk record;
  reds int[] := array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_bets is null or jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) < 1 or jsonb_array_length(p_bets) > 14 then raise exception 'Place 1 to 14 chips on the table.'; end if;
  for b in select * from jsonb_array_elements(p_bets) loop
    a := (b->>'a')::int; t := b->>'t';
    if a is null or a < 10 or a > 5000 then raise exception 'Each chip is 10 to 5,000 Orbits.'; end if;
    if t not in ('n','red','black','odd','even','low','high','d1','d2','d3','c1','c2','c3') then raise exception 'That bet isn''t on the table.'; end if;
    if t = 'n' and ((b->>'v') is null or (b->>'v')::int < 0 or (b->>'v')::int > 36) then raise exception 'Pick a number from 0 to 36.'; end if;
    total := total + a;
  end loop;
  if total > 5000 then raise exception 'You can put at most 5,000 Orbits on one spin.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  select * into tk from public.gamble_take_try(uid, total, bal - public.game_locked(uid));   -- one spin = one try, however many chips
  n := public.casino_rand(37);
  for b in select * from jsonb_array_elements(p_bets) loop
    a := (b->>'a')::int; t := b->>'t'; v := case when t = 'n' then (b->>'v')::int end;
    won := case t
      when 'n' then n = v
      when 'red' then n = any (reds)
      when 'black' then n > 0 and not (n = any (reds))
      when 'odd' then n > 0 and n % 2 = 1
      when 'even' then n > 0 and n % 2 = 0
      when 'low' then n between 1 and 18
      when 'high' then n between 19 and 36
      when 'd1' then n between 1 and 12
      when 'd2' then n between 13 and 24
      when 'd3' then n between 25 and 36
      when 'c1' then n > 0 and n % 3 = 1
      when 'c2' then n > 0 and n % 3 = 2
      when 'c3' then n > 0 and n % 3 = 0 end;
    ret := case when t = 'n' then 36 when t in ('d1','d2','d3','c1','c2','c3') then 3 else 2 end;   -- stake included
    if won then pay := pay + floor(a * ret)::bigint; end if;
    out := out || jsonb_build_array(jsonb_build_object('t', t, 'v', v, 'a', a, 'win', coalesce(won, false), 'back', case when won then floor(a * ret)::bigint else 0 end));
  end loop;
  pay := least(pay, 500000);
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -total, 'gamble_bet', 'rl:' || rid);
  if pay > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (uid, pay, 'gamble_win', 'rl:' || rid); end if;
  return jsonb_build_object('number', n, 'color', case when n = 0 then 'green' when n = any (reds) then 'red' else 'black' end,
    'bets', out, 'bet', total, 'payout', pay, 'net', pay - total, 'balance', bal - total - tk.fee + pay, 'fee', tk.fee, 'tries', tk.tries);
end $$;
revoke all on function public.roulette_spin(jsonb) from public, anon;
grant execute on function public.roulette_spin(jsonb) to authenticated;

-- ───────── status for the page ─────────
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
    'free_per_day', public.gamble_free_tries(), 'tries_used', coalesce(used, 0),
    'free_left', greatest(0, public.gamble_free_tries() - coalesce(used, 0)), 'extra_cost', public.gamble_extra_fee(),
    'resets_in', greatest(0, ceil(extract(epoch from ((d + 1)::timestamp at time zone 'utc' - now()))))::int,
    'today_net', net, 'min_bet', 10, 'max_bet', 5000,
    'bot_game', case when g.id is null then null else public.bj_view(g) end,
    'pvp_game', case when p.id is null then null else public.bj_pvp_view(p, uid) end);
end $$;
revoke all on function public.gamble_status() from public, anon;
grant execute on function public.gamble_status() to authenticated;
