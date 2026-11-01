-- Unified Orbits: game scores, time on Orbit, events and staff awards all feed ONE Orbits balance.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-orbit-leaderboard.sql and migration-orbit-time.sql.
--
--  Automatic:  time on Orbit (+5 per active minute, max 500 per day), game rounds (percent of the score, see below)
--  Staff:      everything else, through award_orbits(user, reason, ref)
--  Spending:   the Prize Room takes Orbits with spend_orbits(). Spending never lowers leaderboard rank.

-- ───────── 1. allow the new reasons and negative rows (spending) ─────────
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.orbit_ledger'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) like '%reason%' or pg_get_constraintdef(oid) like '%amount%') loop
    execute format('alter table public.orbit_ledger drop constraint %I', c);
  end loop;
end $$;

alter table public.orbit_ledger add constraint orbit_ledger_amount_check check (amount <> 0 and amount between -1000000 and 1000000);
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason in (
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit',
  'tournament_2nd','tournament_3rd','login_streak','help','bug_report','poll','staff_event',
  'monthly_milestone','member_of_month',
  'game','spend'));

create index if not exists orbit_ledger_user_time on public.orbit_ledger (user_id, reason, created_at desc);

-- ───────── 2. the balance ─────────
create or replace function public.my_orbits() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::bigint from orbit_ledger where user_id = auth.uid() $$;
revoke all on function public.my_orbits() from public;
grant execute on function public.my_orbits() to authenticated;

-- ───────── 3. time on Orbit: +5 per minute, at most 500 Orbits per day (UTC day) ─────────
create or replace function public.claim_orbit_minute()
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); last_at timestamptz; today_total int; day_start timestamptz := (date_trunc('day', now() at time zone 'utc')) at time zone 'utc';
begin
  if uid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-time-' || uid::text));
  select coalesce(sum(amount), 0), max(created_at) into today_total, last_at
    from orbit_ledger where user_id = uid and reason = 'time_on_orbit' and created_at >= day_start;
  if today_total >= 500 then return 0; end if;                                       -- daily cap reached
  select max(created_at) into last_at from orbit_ledger where user_id = uid and reason = 'time_on_orbit';
  if last_at is not null and now() - last_at < interval '55 seconds' then return 0; end if;   -- one minute pays once, even with several tabs open
  insert into orbit_ledger (user_id, amount, reason, ref)
    values (uid, 5, 'time_on_orbit', 'min-' || floor(extract(epoch from now()) / 60)::bigint)
    on conflict (user_id, reason, ref) do nothing;
  return 5;
end $$;
revoke all on function public.claim_orbit_minute() from public;
grant execute on function public.claim_orbit_minute() to authenticated;

-- ───────── 4. games: a percent of the final score becomes Orbits (rounded to a whole number) ─────────
-- 2048 5%, Block Blast 5%, Block Breaker 5%, Block Out 10%, Dino Run 10%, Flappy Bird 200%, Geometry Dash 30%,
-- Minesweeper 50%, Pac-Man 5%, Slope 50%, Snake 800%, Tetris 0.5%.  (Other games pay nothing.)
-- The score comes from the game in the browser, like the game leaderboards, so the server also limits it:
-- one payout per game per 15 seconds and at most 20,000 Orbits per round.
create or replace function public.claim_game_orbits(p_game text, p_score bigint, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); permille int; amt bigint; last_at timestamptz;
begin
  if uid is null then return 0; end if;
  permille := case p_game
    when 'game2048' then 50   when 'blockblast' then 50  when 'breakout' then 50  when 'blockout' then 100
    when 'dino' then 100      when 'flappy' then 2000    when 'geodash' then 300  when 'minesweeper' then 500
    when 'pacman' then 50     when 'slope' then 500      when 'snake' then 8000   when 'tetris' then 5
    else null end;
  if permille is null or p_score is null or p_score <= 0 or p_score > 10000000 then return 0; end if;
  if coalesce(btrim(p_ref), '') = '' or char_length(p_ref) > 80 then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-game-' || uid::text));
  select max(created_at) into last_at from orbit_ledger
    where user_id = uid and reason = 'game' and ref like p_game || ':%';
  if last_at is not null and now() - last_at < interval '15 seconds' then return 0; end if;
  amt := least((p_score * permille + 500) / 1000, 20000);   -- rounded to the nearest whole Orbit (half rounds up)
  if amt < 1 then return 0; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt::int, 'game', p_game || ':' || btrim(p_ref))
    on conflict (user_id, reason, ref) do nothing;
  return amt::int;
end $$;
revoke all on function public.claim_game_orbits(text, bigint, text) from public;
grant execute on function public.claim_game_orbits(text, bigint, text) to authenticated;

-- ───────── 5. spending (Prize Room) ─────────
create or replace function public.spend_orbits(p_item text, p_price int)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); bal bigint;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_price is null or p_price < 1 or p_price > 100000 then raise exception 'Bad price.'; end if;
  if p_item !~ '^[a-z0-9_]{1,24}$' then raise exception 'Bad item.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_price then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_price, 'spend', p_item || ':' || gen_random_uuid());
  return bal - p_price;
end $$;
revoke all on function public.spend_orbits(text, int) from public;
grant execute on function public.spend_orbits(text, int) to authenticated;

-- ───────── 6. staff awards (owner / admins / moderators) ─────────
-- select award_orbits('<user id>', 'help', 'helped Sam with homework');
-- reasons: event 50, host_event 100, challenge 25, weekly_milestone 75, tournament (1st) 100, tournament_2nd 50,
-- tournament_3rd 25, login_streak 25, help 15, bug_report 25, poll 5, staff_event 50, monthly_milestone 150, member_of_month 200
create or replace function public.award_orbits(p_user uuid, p_reason text, p_ref text, p_minutes int default 0)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can award Orbits.'; end if;
  if coalesce(btrim(p_ref), '') = '' then raise exception 'Say which event or challenge this is for.'; end if;
  v := case p_reason
    when 'event' then 50 when 'host_event' then 100 when 'challenge' then 25 when 'weekly_milestone' then 75
    when 'tournament' then 100 when 'tournament_2nd' then 50 when 'tournament_3rd' then 25
    when 'login_streak' then 25 when 'help' then 15 when 'bug_report' then 25 when 'poll' then 5
    when 'staff_event' then 50 when 'monthly_milestone' then 150 when 'member_of_month' then 200 end;
  if v is null then raise exception 'Unknown reason.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_user, v, p_reason, btrim(p_ref));
  return v;
end $$;
revoke all on function public.award_orbits(uuid, text, text, int) from public;
grant execute on function public.award_orbits(uuid, text, text, int) to authenticated;

-- ───────── 7. leaderboard: counts what people EARNED (spending doesn't drop anyone's rank) ─────────
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_total bigint)
language sql stable security definer set search_path = public as $$
  with w as (select greatest(p_days, 1) as d),
  cur as (select l.user_id, sum(l.amount)::bigint as t from orbit_ledger l, w where l.amount > 0 and l.created_at >= now() - make_interval(days => w.d) group by l.user_id),
  prv as (select l.user_id, sum(l.amount)::bigint as t from orbit_ledger l, w where l.amount > 0 and l.created_at >= now() - make_interval(days => 2 * w.d) and l.created_at < now() - make_interval(days => w.d) group by l.user_id)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, coalesce(prv.t, 0)::bigint
  from cur join profiles p on p.id = cur.user_id left join prv on prv.user_id = cur.user_id
  order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;
