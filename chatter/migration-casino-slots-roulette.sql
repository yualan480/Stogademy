-- Orbit Casino: SLOTS and ROULETTE go live.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run. Run it after migration-gamble.sql and migration-orbit-game-v2.sql.
-- Every spin is decided here, on the server: the reels, the wheel, the bet limits and the payout. The page only draws what it is told.
-- Bets and wins use the same ledger reasons as Blackjack (gamble_bet / gamble_win), so "Today's result" counts them and they never count as earned Orbits.
--
--  Slots     5 reels, 6 symbols. A prize is a run of the same symbol starting on the LEFT reel (2 to 5 in a row). Bet 10 to 5,000. Payout capped at 500,000.
--            Multipliers (run of 2 / 3 / 4 / 5):  Planet 1/4/15/70, Comet 1/5/20/90, Sun 2/8/30/150, Gem 2/15/60/300, Star 4/30/120/600, Seven 8/60/300/2000. About 92% returns to players.
--  Roulette  European wheel, 0 to 36. Bets: a number (35 to 1), red/black, odd/even, 1-18/19-36 (1 to 1), dozens and columns (2 to 1). Zero beats every outside bet.
--            Up to 14 chips per spin, total 10 to 5,000. About 97.3% returns to players.

create or replace function public.casino_rand(n int) returns int language sql volatile as $$
  select (('x' || left(replace(gen_random_uuid()::text, '-', ''), 7))::bit(28)::int) % n $$;
revoke all on function public.casino_rand(int) from public, anon, authenticated;

create or replace function public.slots_spin(p_bet int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; r int[] := '{}'; v int; s int; run int := 1; mult numeric := 0; pay bigint := 0; rid text := gen_random_uuid()::text;
  tbl numeric[][] := array[[1,4,15,70],[1,5,20,90],[2,8,30,150],[2,15,60,300],[4,30,120,600],[8,60,300,2000]];   -- symbol 0..5, run 2..5
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_bet is null or p_bet < 10 or p_bet > 5000 then raise exception 'Bets are 10 to 5,000 Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal - public.game_locked(uid) < p_bet then raise exception 'Not enough unlocked Orbits.'; end if;
  for i in 1..5 loop
    v := public.casino_rand(100);
    s := case when v < 28 then 0 when v < 52 then 1 when v < 72 then 2 when v < 86 then 3 when v < 95 then 4 else 5 end;
    r := r || s;
  end loop;
  while run < 5 and r[run + 1] = r[1] loop run := run + 1; end loop;
  if run >= 2 then mult := tbl[r[1] + 1][run - 1]; pay := least(500000, floor(p_bet * mult))::bigint; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_bet, 'gamble_bet', 'slot:' || rid);
  if pay > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (uid, pay, 'gamble_win', 'slot:' || rid); end if;
  return jsonb_build_object('reels', to_jsonb(r), 'run', run, 'symbol', r[1], 'mult', mult, 'bet', p_bet, 'payout', pay, 'net', pay - p_bet, 'balance', bal - p_bet + pay);
end $$;
revoke all on function public.slots_spin(int) from public, anon;
grant execute on function public.slots_spin(int) to authenticated;

create or replace function public.roulette_spin(p_bets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; n int; total bigint := 0; pay bigint := 0; b jsonb; t text; v int; a int; ret numeric; won boolean; out jsonb := '[]'::jsonb; rid text := gen_random_uuid()::text;
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
  if bal - public.game_locked(uid) < total then raise exception 'Not enough unlocked Orbits.'; end if;
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
    'bets', out, 'bet', total, 'payout', pay, 'net', pay - total, 'balance', bal - total + pay);
end $$;
revoke all on function public.roulette_spin(jsonb) from public, anon;
grant execute on function public.roulette_spin(jsonb) to authenticated;
