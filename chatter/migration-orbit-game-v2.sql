-- Orbit Leaderboard Game v2: the new rules for Steal, Galactic Vault, Mirror Amulet, Orbit Shield, Astral Compass, Sword of Stars and the Orbit Loop.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER migration-orbit-game.sql (it replaces that file's functions and numbers; nothing is deleted except retired config keys).
--
--  Every price, amount, cooldown, weekly limit and outcome is decided in these functions. The browser only asks.
--
--  Steal           3,000 per attempt (kept even if it fails). A success takes 1-25% (random) of the target's UNLOCKED Orbits. Same target once per 24h. Thefts are anonymous.
--  Galactic Vault  5,000 buys one. Using it locks a chosen amount for 48h. Early withdrawal costs 2,000 and the Orbits become stealable again.
--  Mirror Amulet   2,000, one per week (all sources). Reflects one theft: the attacker LOSES the amount they would have stolen. Consumed.
--  Orbit Shield    Loop holder only. Blocks Sword challenges for 48h, then 72h from activation before another. Status and time stay secret.
--  Astral Compass  Clues about which special item a player may hold. Can be inconclusive or wrong. Never balances, messages or alliances.
--  Sword of Stars  Can't be bought. Drawn at random each week (and re-drawn if its holder is idle for 3+ days). One challenge per 7 days. Consumed every time.
--  Orbit Loop      One exists. Won with a Sword, OR bought by paying more than the latest price paid.
--  Everyone plays Every Orbit member is in the game at all times: there is no join or leave. New members are enrolled automatically.
--  Global          Weekly limits count every source, reset Monday 00:00 UTC, never carry over. New players are protected.
--                  Stolen Orbits never count toward earned rankings (migration-orbit-game.sql already leaves 'theft_gain' out).

-- ───────── 1. ledger reason for reflected thefts (keeps every existing reason) ─────────
alter table public.orbit_ledger drop constraint if exists orbit_ledger_reason_check;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason = any (array[
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit','tournament_2nd','tournament_3rd','login_streak','help',
  'bug_report','poll','staff_event','monthly_milestone','member_of_month','game','spend','orbit_drift','gift_out','gift_in',
  'gamble_bet','gamble_fee','gamble_win',
  'theft_cost','theft_gain','theft_loss','game_reward','theft_reflect'])) not valid;

-- ───────── 2. numbers ─────────
delete from public.game_config where k in ('theft_cap', 'theft_daily', 'victim_daily_loss');   -- the old daily caps are gone
insert into public.game_config (k, v) values
  ('theft_cost', 3000), ('theft_pct', 25),                       -- theft_pct = the MAX share of unlocked Orbits one theft can take
  ('vault_min', 1), ('vault_hours', 48), ('vault_early_fee', 2000),
  ('shield_hours', 48), ('shield_wait_hours', 72),               -- wait counts from activation
  ('sword_cooldown_days', 7), ('sword_idle_days', 3)
on conflict (k) do update set v = excluded.v;

update public.game_items set price = 2000, weekly_limit = 1,
  blurb = 'Reflects one theft: the thief loses what they would have taken. Then it shatters.' where id = 'amulet';
update public.game_items set price = 5000,
  blurb = 'Lock Orbits for 48h so they can''t be stolen or spent. Early withdrawal costs 2,000.' where id = 'vault';
update public.game_items set blurb = 'Loop holder only. Blocks Sword challenges for 48h. Wait 72h after activating before the next one.' where id = 'shield';
update public.game_items set price = 0, weekly_limit = 1,
  blurb = 'Can''t be bought. One random player gets it each week. Challenge the Loop holder; the Sword is used up either way.' where id = 'sword';
update public.game_items set blurb = 'Reveals a clue about which special item a player may hold. Clues can be vague or wrong.' where id = 'compass';
-- Shield and Compass prices were not part of the new rules, so they are left as they were. Change them here if you want:
--   update public.game_items set price = ... where id in ('shield', 'compass');

alter table public.item_grants drop constraint if exists item_grants_source_check;
alter table public.item_grants add constraint item_grants_source_check check (source in ('shop','mission','event','tournament','gift','draw'));
alter table public.game_players add column if not exists last_active timestamptz not null default now();

-- ───────── 2b. everyone is in the game, always ─────────
insert into public.game_players (user_id)
  select m.user_id from public.server_members m join auth.users u on u.id = m.user_id where m.server_id = public.main_server()
  on conflict (user_id) do update set active = true, left_at = null;

create or replace function public._game_auto_enroll() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.server_id = public.main_server() then
    insert into game_players (user_id) values (new.user_id) on conflict (user_id) do update set active = true, left_at = null;
  end if;
  return new;
end $$;
drop trigger if exists game_auto_enroll on public.server_members;
create trigger game_auto_enroll after insert on public.server_members for each row execute function public._game_auto_enroll();

create or replace function public.game_join() returns void language plpgsql security definer set search_path = public as $$
begin   -- kept so an old page can't break: joining is automatic now
  if auth.uid() is null then raise exception 'Log in to Orbit first.'; end if;
  insert into game_players (user_id) select auth.uid() where exists (select 1 from server_members where server_id = public.main_server() and user_id = auth.uid())
    on conflict (user_id) do update set active = true, left_at = null;
end $$;
create or replace function public.game_leave() returns void language plpgsql security definer set search_path = public as $$
begin raise exception 'Everyone on Orbit is part of the game. You can''t leave it.'; end $$;
revoke all on function public.game_join(), public.game_leave() from public, anon;
grant execute on function public.game_join(), public.game_leave() to authenticated;

-- ───────── 3. anonymous theft alerts (the victim learns it happened, never who) ─────────
create table if not exists public.game_alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, outcome text not null, amount int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists game_alerts_user on public.game_alerts (user_id, created_at desc);
alter table public.game_alerts enable row level security;
drop policy if exists ga_own on public.game_alerts; create policy ga_own on public.game_alerts for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.game_alerts from anon, authenticated;

-- game_log: a victim can no longer read who hit them. Challenges stay visible (a successful one makes the challenger the public Loop holder anyway).
drop policy if exists gl_own on public.game_log;
create policy gl_own on public.game_log for select to authenticated using (actor = auth.uid() or (target = auth.uid() and kind <> 'theft'));

-- ───────── 4. Sword of Stars: weekly random draw + idle re-draw ─────────
create table if not exists public.game_sword (
  id int primary key check (id = 1),
  holder uuid references auth.users(id) on delete set null,
  assigned_at timestamptz, week_start timestamptz not null default 'epoch'
);
insert into public.game_sword (id) values (1) on conflict (id) do nothing;
alter table public.game_sword enable row level security;
revoke all on public.game_sword from anon, authenticated;   -- nobody can read who holds it

create or replace function public.game_last_seen(p_u uuid) returns timestamptz language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select last_active from game_players where user_id = p_u), 'epoch'),
    coalesce((select max(created_at) from orbit_ledger where user_id = p_u and reason in ('time_on_orbit', 'orbit_drift', 'login_streak')), 'epoch')) $$;

-- one random player who can receive the Sword (not you, not the Loop holder, nobody who already has one or got one this week)
create or replace function public._sword_pick(p_exclude uuid) returns uuid language sql volatile security definer set search_path = public as $$
  select g.user_id from game_players g
   where g.active and g.user_id is distinct from p_exclude
     and g.user_id is distinct from (select holder from orbit_loop where id = 1)
     and not game_newcomer(g.user_id)
     and game_last_seen(g.user_id) > now() - make_interval(days => game_cfg('sword_idle_days'))
     and game_item_week(g.user_id, 'sword') = 0
     and coalesce((select qty from game_inventory where user_id = g.user_id and item_id = 'sword'), 0) = 0
   order by random() limit 1 $$;

create or replace function public._sword_tick() returns void language plpgsql security definer set search_path = public as $$
declare sw game_sword; p uuid;
begin
  perform pg_advisory_xact_lock(hashtext('orbit-sword'));
  select * into sw from game_sword where id = 1 for update;
  -- a new week (Monday 00:00 UTC): one random player gets this week's Sword
  if sw.week_start < game_week() then
    p := _sword_pick(null);
    if p is not null and _grant_item(p, 'sword', 'draw') then
      update game_sword set holder = p, assigned_at = now(), week_start = game_week() where id = 1;
      select * into sw from game_sword where id = 1;
    end if;
  end if;
  -- the holder has gone quiet for 3+ days without using it: it goes to someone else
  if sw.holder is not null and exists (select 1 from game_inventory where user_id = sw.holder and item_id = 'sword' and qty > 0)
     and game_last_seen(sw.holder) <= now() - make_interval(days => game_cfg('sword_idle_days')) then
    p := _sword_pick(sw.holder);
    if p is not null then
      update game_inventory set qty = qty - 1 where user_id = sw.holder and item_id = 'sword' and qty > 0;
      insert into item_grants (user_id, item_id, source) values (p, 'sword', 'draw');
      insert into game_inventory (user_id, item_id, qty) values (p, 'sword', 1) on conflict (user_id, item_id) do update set qty = game_inventory.qty + 1;
      update game_sword set holder = p, assigned_at = now() where id = 1;
    end if;
  end if;
end $$;
revoke all on function public.game_last_seen(uuid), public._sword_pick(uuid), public._sword_tick() from public, anon, authenticated;

-- ───────── 5. the Sword can't be bought or handed out by staff; everything else still can ─────────
create or replace function public.game_buy(p_item text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it game_items;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into it from game_items where id = p_item; if not found then raise exception 'That item is not for sale.'; end if;
  if it.id = 'sword' then raise exception 'The Sword of Stars can''t be bought. One random player receives it each week.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if game_item_week(uid, p_item) >= it.weekly_limit then raise exception 'You''ve reached this week''s limit for the % (%).', it.name, it.weekly_limit; end if;
  if game_bal(uid) - game_locked(uid) < it.price then raise exception 'Not enough unlocked Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -it.price, 'spend', 'game_' || it.id || ':' || gen_random_uuid());
  perform _grant_item(uid, p_item, 'shop');
  return jsonb_build_object('balance', game_bal(uid));
end $$;

create or replace function public.award_game_item(p_user uuid, p_item text, p_source text)
returns text language plpgsql security definer set search_path = public as $$
declare it game_items; refund int;
begin
  if not public.orbit_staff() then raise exception 'Staff only.'; end if;
  if p_item = 'sword' then raise exception 'The Sword of Stars is only ever given out by the weekly random draw.'; end if;
  if p_source not in ('mission','event','tournament','gift') then raise exception 'Bad source.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || p_user::text));
  if _grant_item(p_user, p_item, p_source) then return 'item'; end if;
  select * into it from game_items where id = p_item;
  refund := greatest(1, it.price * game_cfg('reward_refund_pct') / 100);
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_user, refund, 'game_reward', 'gameitem:' || gen_random_uuid());
  return 'orbits';
end $$;

-- ───────── 6. the Orbit Loop: won with a Sword OR bought for more than the latest price paid ─────────
drop function if exists public._loop_move(uuid, text);
create or replace function public._loop_move(p_to uuid, p_how text, p_price int default null) returns void language plpgsql security definer set search_path = public as $$
declare old uuid;
begin
  select holder into old from orbit_loop where id = 1 for update;
  -- a Sword win or an event hand-over keeps the latest price paid, so the next buyer must still beat it
  update orbit_loop set holder = p_to, price = coalesce(p_price, price), takes = takes + 1, taken_at = now() where id = 1;
  insert into orbit_loop_history (user_id, price, how) values (p_to, coalesce(p_price, 0), p_how);
  if old is not null then update game_shield set active_until = now() where user_id = old; end if;   -- a Shield never follows the Loop to its next owner
  insert into game_players (user_id) values (p_to) on conflict (user_id) do update set active = true, left_at = null;
end $$;
revoke all on function public._loop_move(uuid, text, int) from public, anon, authenticated;

create or replace function public.take_orbit_loop(p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp orbit_loop; need int;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_price is null or p_price < 1 then raise exception 'Type a price in Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  select * into lp from orbit_loop where id = 1 for update;   -- one take at a time: two people can never both win the same price
  if not found then raise exception 'The Orbit Loop is not set up yet.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  need := greatest(lp.start_price, lp.price + 1);
  if p_price < need then raise exception 'You need to pay at least % Orbits to take the Orbit Loop.', need; end if;
  if game_bal(uid) - game_locked(uid) < p_price then raise exception 'Not enough unlocked Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_price, 'spend', 'loop:' || gen_random_uuid());
  perform _loop_move(uid, 'purchase', p_price);
  return jsonb_build_object('balance', game_bal(uid), 'price', p_price, 'holder', uid);
end $$;
revoke all on function public.take_orbit_loop(int) from public, anon;
grant execute on function public.take_orbit_loop(int) to authenticated;

-- ───────── 7. Galactic Vault (48h) + early withdrawal, Orbit Shield (48h, 72h wait) ─────────
create or replace function public.use_vault(p_amount int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); spendable bigint; ends timestamptz := now() + make_interval(hours => game_cfg('vault_hours'));
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if exists (select 1 from game_vaults where user_id = uid and ends_at > now()) then raise exception 'You already have a Vault locked.'; end if;
  spendable := game_bal(uid) - game_locked(uid);
  if p_amount is null or p_amount < game_cfg('vault_min') then raise exception 'Lock at least % Orbits.', game_cfg('vault_min'); end if;
  if p_amount > spendable then raise exception 'You only have % unlocked Orbits.', spendable; end if;
  update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'vault' and qty > 0;
  if not found then raise exception 'You don''t have a Galactic Vault.'; end if;
  insert into game_vaults (user_id, amount, ends_at) values (uid, p_amount, ends);
  return jsonb_build_object('locked', p_amount, 'ends_at', ends);
end $$;

create or replace function public.withdraw_vault() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fee int := game_cfg('vault_early_fee'); freed bigint;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  freed := game_locked(uid);
  if freed = 0 then raise exception 'You have no Vault locked.'; end if;
  update game_vaults set ends_at = now() where user_id = uid and ends_at > now();   -- the Orbits are open to theft from this moment
  if game_bal(uid) < fee then raise exception 'Early withdrawal costs % Orbits and you don''t have enough.', fee; end if;   -- rolls the unlock back
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -fee, 'spend', 'vault_early:' || gen_random_uuid());
  return jsonb_build_object('released', freed, 'fee', fee, 'balance', game_bal(uid));
end $$;

create or replace function public.use_shield() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sh game_shield; ends timestamptz := now() + make_interval(hours => game_cfg('shield_hours')); wait_h int := game_cfg('shield_wait_hours');
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  perform 1 from orbit_loop where id = 1 and holder = uid for update;
  if not found then raise exception 'Only the Orbit Loop holder can use a Shield.'; end if;
  select * into sh from game_shield where user_id = uid;
  if found and sh.last_start > now() - make_interval(hours => wait_h) then raise exception 'You can activate another Shield after %.', to_char(sh.last_start + make_interval(hours => wait_h), 'Mon DD HH24:MI "UTC"'); end if;
  update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'shield' and qty > 0;
  if not found then raise exception 'You don''t have an Orbit Shield.'; end if;
  insert into game_shield (user_id, active_until, last_start) values (uid, ends, now())
    on conflict (user_id) do update set active_until = excluded.active_until, last_start = excluded.last_start;
  return jsonb_build_object('active_until', ends);
end $$;
revoke all on function public.use_vault(int), public.withdraw_vault(), public.use_shield() from public, anon;
grant execute on function public.use_vault(int), public.withdraw_vault(), public.use_shield() to authenticated;

-- ───────── 8. Steal ─────────
create or replace function public.attempt_theft(p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); why text; cost int := game_cfg('theft_cost'); amt int; unl bigint; lose int; pct int;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_target is null then raise exception 'Pick a target.'; end if;
  perform game_lock2(uid, p_target);
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if game_newcomer(uid) then raise exception 'New players can''t steal yet.'; end if;
  why := _game_block(uid, p_target); if why is not null then raise exception '%', why; end if;   -- includes the once-per-24h-per-target cooldown
  if game_bal(uid) - game_locked(uid) < cost then raise exception 'You need % unlocked Orbits to attempt a theft.', cost; end if;

  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -cost, 'theft_cost', 'theft:' || gen_random_uuid());   -- paid whatever happens

  -- what this theft WOULD take: a random 1-25% of the target's unlocked Orbits (Vault-locked Orbits are never counted)
  unl := greatest(0, game_bal(p_target) - game_locked(p_target));
  pct := 1 + floor(random() * game_cfg('theft_pct'))::int;
  amt := (unl * pct / 100)::int;

  update game_inventory set qty = qty - 1 where user_id = p_target and item_id = 'amulet' and qty > 0;
  if found then   -- Mirror Amulet: the thief loses what they would have taken (out of their own unlocked Orbits), the Amulet is gone
    lose := least(amt, greatest(0, (game_bal(uid) - game_locked(uid))))::int;
    if lose > 0 then insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -lose, 'theft_reflect', 'theft:' || gen_random_uuid()); end if;
    insert into game_log (kind, actor, target, outcome, amount) values ('theft', uid, p_target, 'reflected', lose);
    insert into game_alerts (user_id, kind, outcome, amount) values (p_target, 'theft', 'reflected', lose);
    return jsonb_build_object('outcome', 'reflected', 'amount', lose, 'cost', cost, 'balance', game_bal(uid));
  end if;

  if amt < 1 then
    insert into game_log (kind, actor, target, outcome) values ('theft', uid, p_target, 'empty');
    insert into game_alerts (user_id, kind, outcome, amount) values (p_target, 'theft', 'empty', 0);
    return jsonb_build_object('outcome', 'empty', 'amount', 0, 'cost', cost, 'balance', game_bal(uid));
  end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_target, -amt, 'theft_loss', 'theft:' || gen_random_uuid());   -- no actor in the victim's ledger
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt, 'theft_gain', 'theft:' || gen_random_uuid());          -- 'theft_gain' never counts as earned
  insert into game_log (kind, actor, target, outcome, amount) values ('theft', uid, p_target, 'stolen', amt);
  insert into game_alerts (user_id, kind, outcome, amount) values (p_target, 'theft', 'stolen', amt);
  update game_players set victories = victories + 1 where user_id = uid;
  return jsonb_build_object('outcome', 'stolen', 'amount', amt, 'cost', cost, 'balance', game_bal(uid));
end $$;

-- ───────── 9. Astral Compass (and the cheap investigate): clues can be vague or wrong. Never balances, messages, alliances or Shield status ─────────
create or replace function public.investigate(p_target uuid, p_compass boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cost int := game_cfg('investigate_cost'); k_ text := case when p_compass then 'compass' else 'investigate' end;
        n int; day0 timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
        pool text[]; pick text; nm text; truth boolean; roll float := random(); acc float := case when p_compass then 0.60 else 0.40 end; vague float := case when p_compass then 0.20 else 0.30 end; clue text;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_target is null or p_target = uid then raise exception 'Pick another player.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if not exists (select 1 from game_players where user_id = p_target and active) then raise exception 'That player isn''t in the game.'; end if;
  if exists (select 1 from game_log where kind in ('investigate','compass') and actor = uid and target = p_target and created_at > now() - interval '1 hour')
    then raise exception 'You investigated them recently. Try again in an hour.'; end if;
  select count(*) into n from game_log where kind in ('investigate','compass') and actor = uid and created_at >= day0;
  if n >= game_cfg('investigate_daily') then raise exception 'Daily investigation limit reached.'; end if;
  if p_compass then
    update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'compass' and qty > 0;
    if not found then raise exception 'You don''t have an Astral Compass.'; end if;
  else
    if game_bal(uid) - game_locked(uid) < cost then raise exception 'You need % unlocked Orbits to investigate.', cost; end if;
    insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -cost, 'spend', 'investigate:' || gen_random_uuid());
  end if;

  -- which special item is this clue about? (Shield is left out for the Loop holder: whether it is raised must stay secret)
  pool := array['amulet', 'sword', 'compass', 'vault'];
  if p_target is distinct from (select holder from orbit_loop where id = 1) then pool := pool || 'shield'; end if;
  pick := pool[1 + floor(random() * array_length(pool, 1))::int];
  select name into nm from game_items where id = pick;
  truth := case when pick = 'vault' then exists (select 1 from game_vaults where user_id = p_target and ends_at > now())
                else coalesce((select qty from game_inventory where user_id = p_target and item_id = pick), 0) > 0 end;

  if roll < acc then     -- accurate
    clue := case when truth then 'The readings point to a ' || nm || '.' else 'You find no trace of a ' || nm || '.' end;
  elsif roll < acc + vague then   -- inconclusive
    clue := (array['The signal is too faint to tell.', 'Something is there, but it won''t resolve into a shape.', 'The readings contradict each other.'])[1 + floor(random() * 3)::int];
  else     -- inaccurate: it says the opposite
    clue := case when truth then 'You find no trace of a ' || nm || '.' else 'The readings point to a ' || nm || '.' end;
  end if;

  insert into game_log (kind, actor, target, outcome) values (k_, uid, p_target, 'clue');
  update game_players set discoveries = discoveries + 1 where user_id = uid;
  return jsonb_build_object('clue', clue, 'compass', p_compass, 'balance', game_bal(uid));
end $$;
revoke all on function public.attempt_theft(uuid), public.investigate(uuid, boolean) from public, anon;
grant execute on function public.attempt_theft(uuid), public.investigate(uuid, boolean) to authenticated;

-- ───────── 10. Sword challenge: one per 7 days, Sword used up every time ─────────
create or replace function public.challenge_loop() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp orbit_loop; blocked boolean; cd int := game_cfg('sword_cooldown_days'); last_c timestamptz;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if game_newcomer(uid) then raise exception 'New players can''t challenge yet.'; end if;
  select max(created_at) into last_c from game_log where kind = 'challenge' and actor = uid;
  if last_c is not null and last_c > now() - make_interval(days => cd) then
    raise exception 'You can challenge again after %.', to_char(last_c + make_interval(days => cd), 'Mon DD HH24:MI "UTC"'); end if;
  select * into lp from orbit_loop where id = 1 for update;   -- one challenge at a time
  if lp.holder is null then raise exception 'Nobody holds the Loop yet. Staff hand it out at an event.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'sword' and qty > 0;
  if not found then raise exception 'You don''t have a Sword of Stars.'; end if;   -- used up whatever happens next
  update game_sword set holder = null where id = 1 and holder = uid;
  select exists (select 1 from game_shield where user_id = lp.holder and active_until > now()) into blocked;
  if blocked then
    insert into game_log (kind, actor, target, outcome) values ('challenge', uid, lp.holder, 'blocked');
    return jsonb_build_object('outcome', 'blocked');
  end if;
  perform _loop_move(uid, 'challenge');
  insert into game_log (kind, actor, target, outcome) values ('challenge', uid, lp.holder, 'transferred');
  update game_players set victories = victories + 1 where user_id = uid;
  return jsonb_build_object('outcome', 'transferred');
end $$;
revoke all on function public.challenge_loop() from public, anon;
grant execute on function public.challenge_loop() to authenticated;

-- ───────── 11. everything the page needs (now VOLATILE: opening it also runs the weekly Sword draw) ─────────
create or replace function public.game_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me game_players; got boolean; r jsonb;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  insert into game_players (user_id) select uid where exists (select 1 from server_members where server_id = public.main_server() and user_id = uid)
    on conflict (user_id) do update set active = true, left_at = null, last_active = now();   -- members are always in the game
  perform _sword_tick();
  select * into me from game_players where user_id = uid; got := found;
  select jsonb_build_object(
    'joined', coalesce(me.active, false), 'rejoin_at', case when got and not me.active then me.left_at + interval '24 hours' end,
    'newcomer', game_newcomer(uid), 'balance', game_bal(uid), 'locked', game_locked(uid),
    'cfg', (select jsonb_object_agg(k, v) from game_config),
    'catalog', (select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'rarity', i.rarity, 'price', i.price, 'limit', i.weekly_limit, 'blurb', i.blurb, 'c1', i.c1, 'c2', i.c2, 'glyph', i.glyph,
                   'used', game_item_week(uid, i.id), 'qty', coalesce((select qty from game_inventory where user_id = uid and item_id = i.id), 0)) order by i.price) from game_items i),
    'week_resets', game_week() + interval '7 days',
    'vault', (select jsonb_build_object('amount', amount, 'ends_at', ends_at) from game_vaults where user_id = uid and ends_at > now() order by ends_at desc limit 1),
    'shield', (select jsonb_build_object('active_until', active_until, 'next_ok', last_start + make_interval(hours => game_cfg('shield_wait_hours'))) from game_shield where user_id = uid),
    'next_challenge', (select max(created_at) + make_interval(days => game_cfg('sword_cooldown_days')) from game_log where kind = 'challenge' and actor = uid),
    'notes', coalesce((select jsonb_object_agg(target, note) from game_notes where user_id = uid), '{}'::jsonb),
    'loop', (select jsonb_build_object('holder', l.holder, 'name', p.display_name, 'since', l.taken_at, 'takes', l.takes, 'price', l.price, 'start_price', l.start_price,
               'history', coalesce((select jsonb_agg(jsonb_build_object('name', hp.display_name, 'at', h.taken_at, 'how', h.how, 'price', h.price) order by h.taken_at desc)
                                      from (select * from orbit_loop_history order by taken_at desc limit 5) h left join profiles hp on hp.id = h.user_id), '[]'::jsonb))
               from orbit_loop l left join profiles p on p.id = l.holder where l.id = 1),
    'players', coalesce((select jsonb_object_agg(g.user_id, jsonb_build_object('victories', g.victories, 'discoveries', g.discoveries, 'block', _game_block(uid, g.user_id))) from game_players g where g.active), '{}'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.game_state() from public, anon;
grant execute on function public.game_state() to authenticated;

-- ───────── 12. live updates for the anonymous theft alerts ─────────
do $$ begin
  begin alter publication supabase_realtime add table public.game_alerts; exception when duplicate_object then null; when undefined_object then null; end;
end $$;
