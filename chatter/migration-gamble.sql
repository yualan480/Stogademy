-- Orbit Gamble, part 1: BLACKJACK (vs the Orbit Bot, and vs other players).
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-gifts-channels.sql (it replaces orbit_leaderboard and the ledger reason list from that file).
--
-- Orbits are a free, non-purchasable play currency. Nothing here touches real money.
-- Every card is dealt on the SERVER and the dealer's face-down card never leaves it until the hand is over,
-- so editing the page in the browser can't peek at cards, pick cards, change a bet or change a payout.
--
--  vs the Orbit Bot   3 free hands per day (UTC day, resets at 00:00 UTC). Every extra hand costs a 1,000 Orbit try fee on top of the bet.
--  vs players         unlimited. Two players ante the same amount, play head to head, the closer to 21 wins the pot.
--  Rules              blackjack (21 on the first two cards) pays 3:2 against the bot, dealer stands on every 17, no splits or doubles.
--                     Bets are 10 to 5,000 Orbits. Head to head: bust loses, higher total wins, tie returns both antes.
--  Leaderboard        gambling winnings never count as "earned", so they can't inflate the Day/Week/Month/All-time boards
--                     (they do move "Current", which is the balance).

-- ───────── 1. ledger: three new reasons ─────────
--  gamble_bet  (negative) the stake or ante          gamble_fee (negative) the 1,000 extra-try fee
--  gamble_win  (positive) the whole payout, stake included, or a refund on a tie / cancelled table
alter table public.orbit_ledger drop constraint if exists orbit_ledger_reason_check;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason = any (array[
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit','tournament_2nd','tournament_3rd','login_streak','help',
  'bug_report','poll','staff_event','monthly_milestone','member_of_month','game','spend','orbit_drift','gift_out','gift_in',
  'gamble_bet','gamble_fee','gamble_win'])) not valid;

-- ───────── 2. leaderboard: gifts AND gambling payouts are not "earned" ─────────
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_rank bigint)
language sql stable security definer set search_path = public as $$
  with m as (select coalesce(p_days, 1) as d),
  cur as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then true
                when m.d = 0 then l.amount > 0 and l.reason not in ('gift_in', 'gamble_win')
                else l.amount > 0 and l.reason not in ('gift_in', 'gamble_win') and l.created_at >= now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then l.created_at < now() - interval '7 days'
                when m.d = 0 then l.amount > 0 and l.reason not in ('gift_in', 'gamble_win') and l.created_at < now() - interval '7 days'
                else l.amount > 0 and l.reason not in ('gift_in', 'gamble_win') and l.created_at >= now() - make_interval(days => 2 * m.d) and l.created_at < now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv_r as (select user_id, rank() over (order by t desc) as r from prv)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, prv_r.r
    from cur join profiles p on p.id = cur.user_id left join prv_r on prv_r.user_id = cur.user_id
   order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;

-- ───────── 3. tables (nobody can read or write them directly: everything goes through the functions below) ─────────
create table if not exists public.gamble_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  tries   int  not null default 0,          -- bot hands started that day (free ones first, then paid)
  primary key (user_id, day)
);

-- one row per bot hand. deck = the cards still to come, in order; card = 0..51, rank = card % 13 (0 = Ace), suit = card / 13
create table if not exists public.bj_games (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  bet        int  not null check (bet between 10 and 5000),
  deck       int[] not null,
  player     int[] not null,
  dealer     int[] not null,                -- [1] = face-up card, [2] = face-down card
  status     text not null default 'active' check (status in ('active', 'done')),
  outcome    text check (outcome in ('blackjack', 'win', 'lose', 'push', 'bust', 'dealer_bust')),
  payout     int  not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists bj_one_active_hand on public.bj_games (user_id) where status = 'active';
create index if not exists bj_games_user_time on public.bj_games (user_id, created_at desc);

-- head to head tables
create table if not exists public.bj_pvp (
  id          uuid primary key default gen_random_uuid(),
  host        uuid not null references auth.users(id) on delete cascade,
  guest       uuid references auth.users(id) on delete cascade,
  ante        int  not null check (ante between 10 and 5000),
  status      text not null default 'open' check (status in ('open', 'playing', 'done', 'cancelled')),
  deck        int[] not null default '{}',
  host_hand   int[] not null default '{}',
  guest_hand  int[] not null default '{}',
  host_stand  boolean not null default false,
  guest_stand boolean not null default false,
  turn        uuid,
  deadline    timestamptz,
  winner      uuid,
  outcome     text check (outcome in ('blackjack', 'bust', 'higher', 'push')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bj_pvp_status on public.bj_pvp (status, created_at desc);
create index if not exists bj_pvp_host on public.bj_pvp (host, status);
create index if not exists bj_pvp_guest on public.bj_pvp (guest, status);

alter table public.gamble_daily enable row level security;
alter table public.bj_games enable row level security;
alter table public.bj_pvp enable row level security;
revoke all on public.gamble_daily, public.bj_games, public.bj_pvp from anon, authenticated;

-- ───────── 4. card helpers ─────────
create or replace function public.bj_total(h int[]) returns int language plpgsql immutable as $$
declare t int := 0; a int := 0; c int; r int;
begin
  if h is null then return 0; end if;
  foreach c in array h loop
    r := c % 13;
    if r = 0 then t := t + 11; a := a + 1;           -- Ace
    elsif r >= 9 then t := t + 10;                   -- 10, J, Q, K
    else t := t + r + 1; end if;                     -- 2 to 9
  end loop;
  while t > 21 and a > 0 loop t := t - 10; a := a - 1; end loop;   -- Aces drop from 11 to 1 when needed
  return t;
end $$;

-- a fresh shuffled 52 card deck (gen_random_uuid is cryptographically random)
create or replace function public.bj_shuffle() returns int[] language sql volatile as $$
  select array_agg(n order by gen_random_uuid()) from generate_series(0, 51) n $$;

create or replace function public.gamble_day() returns date language sql stable as $$
  select (now() at time zone 'utc')::date $$;

-- what the browser may see of a bot hand: the dealer's second card stays hidden (-1) until the hand is over
create or replace function public.bj_view(g public.bj_games) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', g.id, 'bet', g.bet, 'status', g.status, 'outcome', g.outcome, 'payout', g.payout,
    'player', to_jsonb(g.player), 'player_total', public.bj_total(g.player),
    'dealer', case when g.status = 'active' then jsonb_build_array(g.dealer[1], -1) else to_jsonb(g.dealer) end,
    'dealer_total', public.bj_total(case when g.status = 'active' then array[g.dealer[1]] else g.dealer end),
    'dealer_hidden', g.status = 'active') $$;

-- ───────── 5. blackjack vs the Orbit Bot ─────────
-- pays out and closes a hand. p_dealer_plays: the dealer draws to 17 first (not when the player busted or someone has a natural)
create or replace function public.bj_bot_finish(g public.bj_games, p_dealer_plays boolean)
returns public.bj_games language plpgsql security definer set search_path = public as $$
declare pt int; dt int; o text; pay int := 0; pnat boolean; dnat boolean;
begin
  pnat := array_length(g.player, 1) = 2 and public.bj_total(g.player) = 21;   -- a natural is 21 on exactly two cards
  if p_dealer_plays then
    while public.bj_total(g.dealer) < 17 loop g.dealer := g.dealer || g.deck[1]; g.deck := g.deck[2:]; end loop;   -- dealer stands on every 17
  end if;
  pt := public.bj_total(g.player); dt := public.bj_total(g.dealer);
  dnat := array_length(g.dealer, 1) = 2 and dt = 21;
  if pt > 21 then o := 'bust';
  elsif pnat and dnat then o := 'push'; pay := g.bet;
  elsif pnat then o := 'blackjack'; pay := g.bet + (g.bet * 3) / 2;      -- 3:2, rounded down
  elsif dnat then o := 'lose';
  elsif dt > 21 then o := 'dealer_bust'; pay := g.bet * 2;
  elsif pt > dt then o := 'win'; pay := g.bet * 2;
  elsif pt = dt then o := 'push'; pay := g.bet;
  else o := 'lose'; end if;
  if pay > 0 then
    insert into orbit_ledger (user_id, amount, reason, ref) values (g.user_id, pay, 'gamble_win', 'bj:' || g.id)
      on conflict (user_id, reason, ref) do nothing;
  end if;
  update bj_games set deck = g.deck, dealer = g.dealer, status = 'done', outcome = o, payout = pay where id = g.id
    returning * into g;
  return g;
end $$;
revoke all on function public.bj_bot_finish(public.bj_games, boolean) from public, anon, authenticated;

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
  if used >= 3 then fee := 1000; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_bet + fee then
    raise exception '%', case when fee > 0 then 'Extra tries cost 1,000 Orbits plus your bet. You need ' || to_char(p_bet + fee, 'FM999,999') || ' Orbits.' else 'Not enough Orbits.' end;
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

create or replace function public.bj_bot_act(p_game uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g bj_games;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_action not in ('hit', 'stand') then raise exception 'Hit or stand.'; end if;
  select * into g from bj_games where id = p_game and user_id = uid for update;
  if not found or g.status <> 'active' then raise exception 'That hand is already over.'; end if;
  if p_action = 'hit' then
    g.player := g.player || g.deck[1]; g.deck := g.deck[2:];
    update bj_games set player = g.player, deck = g.deck where id = g.id;
    if public.bj_total(g.player) > 21 then g := public.bj_bot_finish(g, false);                 -- bust: the dealer doesn't need to draw
    elsif public.bj_total(g.player) = 21 then g := public.bj_bot_finish(g, true); end if;       -- 21: stand automatically
  else
    g := public.bj_bot_finish(g, true);
  end if;
  return jsonb_build_object('game', public.bj_view(g), 'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $$;
revoke all on function public.bj_bot_act(uuid, text) from public, anon;
grant execute on function public.bj_bot_act(uuid, text) to authenticated;

-- ───────── 6. blackjack vs players (head to head) ─────────
-- what one player may see: their own hand in full, the other player's hand with the first card face down until the end
create or replace function public.bj_pvp_view(p public.bj_pvp, v uuid) returns jsonb language plpgsql stable as $$
declare ishost boolean := (v = p.host); mine int[]; theirs int[]; fin boolean := (p.status in ('done', 'cancelled'));
begin
  mine := case when ishost then p.host_hand else p.guest_hand end;
  theirs := case when ishost then p.guest_hand else p.host_hand end;
  return jsonb_build_object(
    'id', p.id, 'ante', p.ante, 'status', p.status, 'host', p.host, 'guest', p.guest,
    'opponent', case when ishost then p.guest else p.host end,
    'mine', to_jsonb(mine), 'my_total', public.bj_total(mine),
    'theirs', case when fin then to_jsonb(theirs) when array_length(theirs, 1) is null then '[]'::jsonb else to_jsonb(array[-1] || theirs[2:]) end,
    'their_total', case when fin then public.bj_total(theirs) else null end,
    'their_count', coalesce(array_length(theirs, 1), 0),
    'my_stand', case when ishost then p.host_stand else p.guest_stand end,
    'their_stand', case when ishost then p.guest_stand else p.host_stand end,
    'my_turn', p.status = 'playing' and p.turn = v,
    'secs_left', case when p.status = 'playing' then greatest(0, ceil(extract(epoch from (p.deadline - now()))))::int else null end,
    'winner', p.winner, 'outcome', p.outcome, 'pot', p.ante * 2);
end $$;

create or replace function public.bj_pvp_save(p public.bj_pvp) returns public.bj_pvp language plpgsql security definer set search_path = public as $$
begin
  update bj_pvp set deck = p.deck, host_hand = p.host_hand, guest_hand = p.guest_hand, host_stand = p.host_stand, guest_stand = p.guest_stand,
    turn = p.turn, deadline = p.deadline, updated_at = now() where id = p.id returning * into p;
  return p;
end $$;

-- compares the two hands, pays the pot (or refunds both antes on a tie) and closes the table
create or replace function public.bj_pvp_resolve(p public.bj_pvp) returns public.bj_pvp language plpgsql security definer set search_path = public as $$
declare ht int := public.bj_total(p.host_hand); gt int := public.bj_total(p.guest_hand); w uuid; o text;
begin
  if ht > 21 and gt > 21 then o := 'push';
  elsif ht > 21 then w := p.guest; o := 'bust';
  elsif gt > 21 then w := p.host; o := 'bust';
  elsif ht = gt then o := 'push';
  elsif ht > gt then w := p.host; o := 'higher';
  else w := p.guest; o := 'higher'; end if;
  if w is not null and o = 'higher' and ((w = p.host and array_length(p.host_hand, 1) = 2 and ht = 21) or (w = p.guest and array_length(p.guest_hand, 1) = 2 and gt = 21)) then
    o := 'blackjack';
  end if;
  if w is null then
    insert into orbit_ledger (user_id, amount, reason, ref) values (p.host, p.ante, 'gamble_win', 'pvp:' || p.id || ':' || p.host) on conflict (user_id, reason, ref) do nothing;
    insert into orbit_ledger (user_id, amount, reason, ref) values (p.guest, p.ante, 'gamble_win', 'pvp:' || p.id || ':' || p.guest) on conflict (user_id, reason, ref) do nothing;
  else
    insert into orbit_ledger (user_id, amount, reason, ref) values (w, p.ante * 2, 'gamble_win', 'pvp:' || p.id || ':' || w) on conflict (user_id, reason, ref) do nothing;
  end if;
  update bj_pvp set deck = p.deck, host_hand = p.host_hand, guest_hand = p.guest_hand, host_stand = p.host_stand, guest_stand = p.guest_stand,
    status = 'done', winner = w, outcome = o, turn = null, deadline = null, updated_at = now() where id = p.id returning * into p;
  return p;
end $$;

-- the player whose turn it is stands (on their own, or because their 45 seconds ran out)
create or replace function public.bj_pvp_stand(p public.bj_pvp) returns public.bj_pvp language plpgsql security definer set search_path = public as $$
begin
  if p.turn = p.host then p.host_stand := true; else p.guest_stand := true; end if;
  if p.host_stand and p.guest_stand then return public.bj_pvp_resolve(p); end if;
  p.turn := case when p.turn = p.host then p.guest else p.host end;
  p.deadline := now() + interval '45 seconds';
  return public.bj_pvp_save(p);
end $$;

-- slow players are stood automatically, so one person leaving can never freeze a table
create or replace function public.bj_pvp_tick(p public.bj_pvp) returns public.bj_pvp language plpgsql security definer set search_path = public as $$
begin
  if p.status = 'playing' and p.deadline is not null and now() > p.deadline then p := public.bj_pvp_stand(p); end if;
  return p;
end $$;

-- open tables nobody joined for 30 minutes are closed and the ante is refunded
create or replace function public.bj_pvp_expire() returns void language plpgsql security definer set search_path = public as $$
declare r bj_pvp;
begin
  for r in select * from bj_pvp where status = 'open' and created_at < now() - interval '30 minutes' for update skip locked loop
    insert into orbit_ledger (user_id, amount, reason, ref) values (r.host, r.ante, 'gamble_win', 'pvp:' || r.id || ':' || r.host) on conflict (user_id, reason, ref) do nothing;
    update bj_pvp set status = 'cancelled', updated_at = now() where id = r.id;
  end loop;
end $$;
revoke all on function public.bj_pvp_view(public.bj_pvp, uuid), public.bj_pvp_save(public.bj_pvp), public.bj_pvp_resolve(public.bj_pvp),
  public.bj_pvp_stand(public.bj_pvp), public.bj_pvp_tick(public.bj_pvp), public.bj_pvp_expire() from public, anon, authenticated;

create or replace function public.bj_pvp_create(p_ante int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; p bj_pvp;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_ante is null or p_ante < 10 or p_ante > 5000 then raise exception 'Bets are 10 to 5,000 Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if exists (select 1 from bj_pvp where status in ('open', 'playing') and (host = uid or guest = uid)) then raise exception 'Finish or leave your current table first.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_ante then raise exception 'Not enough Orbits.'; end if;
  insert into bj_pvp (host, ante) values (uid, p_ante) returning * into p;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_ante, 'gamble_bet', 'pvp:' || p.id || ':' || uid);
  return jsonb_build_object('game', public.bj_pvp_view(p, uid), 'balance', bal - p_ante);
end $$;
revoke all on function public.bj_pvp_create(int) from public, anon;
grant execute on function public.bj_pvp_create(int) to authenticated;

create or replace function public.bj_pvp_cancel(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p bj_pvp;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into p from bj_pvp where id = p_id for update;
  if not found or p.host <> uid then raise exception 'That is not your table.'; end if;
  if p.status <> 'open' then raise exception 'Someone already joined, so this table can''t be cancelled.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, p.ante, 'gamble_win', 'pvp:' || p.id || ':' || uid) on conflict (user_id, reason, ref) do nothing;
  update bj_pvp set status = 'cancelled', updated_at = now() where id = p.id;
  return jsonb_build_object('balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $$;
revoke all on function public.bj_pvp_cancel(uuid) from public, anon;
grant execute on function public.bj_pvp_cancel(uuid) to authenticated;

create or replace function public.bj_pvp_join(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint; p bj_pvp; dk int[];
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select * into p from bj_pvp where id = p_id for update;
  if not found or p.status <> 'open' then raise exception 'That table was taken or closed.'; end if;
  if p.host = uid then raise exception 'You can''t join your own table.'; end if;
  if exists (select 1 from bj_pvp where status in ('open', 'playing') and (host = uid or guest = uid)) then raise exception 'Finish or leave your current table first.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p.ante then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p.ante, 'gamble_bet', 'pvp:' || p.id || ':' || uid);
  dk := public.bj_shuffle();
  p.guest := uid; p.status := 'playing';
  p.host_hand := array[dk[1], dk[3]]; p.guest_hand := array[dk[2], dk[4]]; p.deck := dk[5:];
  p.turn := case when get_byte(uuid_send(gen_random_uuid()), 15) % 2 = 0 then p.host else p.guest end;   -- a coin flip decides who acts first
  p.deadline := now() + interval '45 seconds';
  update bj_pvp set guest = p.guest, status = 'playing', deck = p.deck, host_hand = p.host_hand, guest_hand = p.guest_hand, turn = p.turn, deadline = p.deadline, updated_at = now() where id = p.id;
  if public.bj_total(p.host_hand) = 21 or public.bj_total(p.guest_hand) = 21 then p := public.bj_pvp_resolve(p); end if;   -- a natural ends it
  select * into p from bj_pvp where id = p.id;
  return jsonb_build_object('game', public.bj_pvp_view(p, uid), 'balance', bal - p.ante);
end $$;
revoke all on function public.bj_pvp_join(uuid) from public, anon;
grant execute on function public.bj_pvp_join(uuid) to authenticated;

create or replace function public.bj_pvp_act(p_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p bj_pvp; t int;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_action not in ('hit', 'stand') then raise exception 'Hit or stand.'; end if;
  select * into p from bj_pvp where id = p_id for update;
  if not found or (p.host <> uid and p.guest is distinct from uid) then raise exception 'That is not your table.'; end if;
  p := public.bj_pvp_tick(p);
  if p.status <> 'playing' then
    return jsonb_build_object('game', public.bj_pvp_view(p, uid), 'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
  end if;
  if p.turn <> uid then raise exception 'It''s not your turn.'; end if;
  if p_action = 'hit' then
    if uid = p.host then p.host_hand := p.host_hand || p.deck[1]; t := public.bj_total(p.host_hand);
    else p.guest_hand := p.guest_hand || p.deck[1]; t := public.bj_total(p.guest_hand); end if;
    p.deck := p.deck[2:];
    if t > 21 then p := public.bj_pvp_resolve(p);                       -- bust: the other player wins at once
    elsif t = 21 then p := public.bj_pvp_stand(public.bj_pvp_save(p));   -- 21: stand automatically
    else p.deadline := now() + interval '45 seconds'; p := public.bj_pvp_save(p); end if;
  else
    p := public.bj_pvp_stand(p);
  end if;
  return jsonb_build_object('game', public.bj_pvp_view(p, uid), 'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $$;
revoke all on function public.bj_pvp_act(uuid, text) from public, anon;
grant execute on function public.bj_pvp_act(uuid, text) to authenticated;

-- polled by the browser while a table is on screen
create or replace function public.bj_pvp_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p bj_pvp;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into p from bj_pvp where id = p_id for update;
  if not found or (p.host <> uid and p.guest is distinct from uid) then raise exception 'That is not your table.'; end if;
  p := public.bj_pvp_tick(p);
  return jsonb_build_object('game', public.bj_pvp_view(p, uid), 'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $$;
revoke all on function public.bj_pvp_get(uuid) from public, anon;
grant execute on function public.bj_pvp_get(uuid) to authenticated;

-- the lobby: tables waiting for a challenger
create or replace function public.bj_pvp_list()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform public.bj_pvp_expire();
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'host', t.host, 'name', pr.display_name, 'ante', t.ante, 'age', extract(epoch from (now() - t.created_at))::int) order by t.created_at desc)
    from (select * from bj_pvp where status = 'open' and host <> uid order by created_at desc limit 30) t
    join profiles pr on pr.id = t.host), '[]'::jsonb);
end $$;
revoke all on function public.bj_pvp_list() from public, anon;
grant execute on function public.bj_pvp_list() to authenticated;

-- ───────── 7. everything the Orbit Gamble page needs when it opens ─────────
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
    'free_per_day', 3, 'tries_used', coalesce(used, 0), 'free_left', greatest(0, 3 - coalesce(used, 0)), 'extra_cost', 1000,
    'resets_in', greatest(0, ceil(extract(epoch from ((d + 1)::timestamp at time zone 'utc' - now()))))::int,
    'today_net', net, 'min_bet', 10, 'max_bet', 5000,
    'bot_game', case when g.id is null then null else public.bj_view(g) end,
    'pvp_game', case when p.id is null then null else public.bj_pvp_view(p, uid) end);
end $$;
revoke all on function public.gamble_status() from public, anon;
grant execute on function public.gamble_status() to authenticated;
