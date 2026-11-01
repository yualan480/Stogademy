-- Orbit Leaderboard Game: items, theft, investigations, Loop challenges.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-gamble.sql (it extends the same Orbits ledger and leaderboard).
--
--  Everything is decided here, on the server. The browser only asks; it can never set a price, an amount, a cooldown or an outcome.
--  game_inventory / game_vaults / game_shield / game_notes are private (own rows only). Nobody can read another player's items.
--  A trigger on orbit_ledger stops Vault-locked Orbits from being spent by ANY feature (shop, gamble, tournaments, gifts).
--  The old "highest price wins the Loop" purchase is retired: the Loop now moves only by a Sword of Stars challenge or a staff-designated event.

-- ───────── 1. ledger reasons (keeps every existing reason) ─────────
alter table public.orbit_ledger drop constraint if exists orbit_ledger_reason_check;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason = any (array[
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit','tournament_2nd','tournament_3rd','login_streak','help',
  'bug_report','poll','staff_event','monthly_milestone','member_of_month','game','spend','orbit_drift','gift_out','gift_in',
  'gamble_bet','gamble_fee','gamble_win',
  'theft_cost','theft_gain','theft_loss','game_reward'])) not valid;

-- ───────── 2. tables ─────────
create table if not exists public.game_config (k text primary key, v int not null);
insert into public.game_config (k, v) values
  ('theft_cost', 5), ('theft_cap', 40), ('theft_pct', 10), ('theft_daily', 5), ('victim_daily_loss', 100),
  ('newcomer_days', 7), ('newcomer_earned', 200), ('investigate_cost', 10), ('investigate_daily', 10),
  ('vault_min', 10), ('reward_refund_pct', 50)
on conflict (k) do nothing;

create table if not exists public.game_items (
  id text primary key check (id ~ '^[a-z_]{1,24}$'),
  name text not null, rarity text not null, price int not null check (price between 0 and 100000),
  weekly_limit int not null check (weekly_limit >= 0), blurb text not null default '',
  c1 text not null default '#2563eb', c2 text not null default '#9a86ff', glyph text not null default '✦'
);
insert into public.game_items (id, name, rarity, price, weekly_limit, blurb, c1, c2, glyph) values
  ('amulet',  'Mirror Amulet',     'rare',     150, 2, 'Blocks one theft against you, then shatters.',                         '#37c8ff', '#9a86ff', '◈'),
  ('compass', 'Astral Compass',    'rare',     120, 2, 'Reveals a sharper clue about a player''s hidden items.',               '#3ecf8e', '#37c8ff', '✧'),
  ('shield',  'Orbit Shield',      'rare',     250, 2, 'Loop holder only. Blocks Sword challenges for 24h. 48h wait between uses.', '#6aa8ff', '#2563eb', '⬡'),
  ('sword',   'Sword of Stars',    'epic',     600, 1, 'Challenge the Loop holder. A Shield blocks it and breaks the Sword.',  '#b05bff', '#ef5b5b', '⚔'),
  ('vault',   'Galactic Vault',    'uncommon',  80, 3, 'Lock Orbits against theft for 24h. Locked Orbits can''t be spent.',    '#6aa8ff', '#9a86ff', '▣')
on conflict (id) do nothing;

create table if not exists public.game_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(), left_at timestamptz,
  active boolean not null default true,
  victories int not null default 0, discoveries int not null default 0
);
create table if not exists public.game_inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.game_items(id),
  qty int not null default 0 check (qty >= 0), primary key (user_id, item_id)
);
create table if not exists public.item_grants (   -- every way an item can arrive; the weekly limit counts ALL of these together
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.game_items(id),
  source text not null check (source in ('shop','mission','event','tournament','gift')),
  created_at timestamptz not null default now()
);
create index if not exists item_grants_week on public.item_grants (user_id, item_id, created_at desc);
create table if not exists public.game_vaults (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null check (amount > 0), ends_at timestamptz not null
);
create index if not exists game_vaults_user on public.game_vaults (user_id, ends_at desc);
create table if not exists public.game_shield (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_until timestamptz not null default 'epoch', last_start timestamptz not null default 'epoch'
);
create table if not exists public.game_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 280), updated_at timestamptz not null default now(),
  primary key (user_id, target)
);
create table if not exists public.game_log (   -- who did what to whom. Holds an outcome and an amount only, never anyone's inventory
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('theft','challenge','investigate','compass')),
  actor uuid not null references auth.users(id) on delete cascade,
  target uuid references auth.users(id) on delete cascade,
  outcome text not null, amount int not null default 0, created_at timestamptz not null default now()
);
create index if not exists game_log_actor on public.game_log (actor, kind, created_at desc);
create index if not exists game_log_target on public.game_log (target, kind, created_at desc);
alter table public.orbit_loop_history add column if not exists how text not null default 'purchase';

alter table public.game_config enable row level security;       alter table public.game_items enable row level security;
alter table public.game_players enable row level security;      alter table public.game_inventory enable row level security;
alter table public.item_grants enable row level security;       alter table public.game_vaults enable row level security;
alter table public.game_shield enable row level security;       alter table public.game_notes enable row level security;
alter table public.game_log enable row level security;
drop policy if exists gi_read on public.game_items;       create policy gi_read on public.game_items for select to authenticated using (true);
drop policy if exists gc_read on public.game_config;      create policy gc_read on public.game_config for select to authenticated using (true);
drop policy if exists gp_read on public.game_players;     create policy gp_read on public.game_players for select to authenticated using (true);   -- joined + counts only
drop policy if exists ginv_own on public.game_inventory; create policy ginv_own on public.game_inventory for select to authenticated using (user_id = auth.uid());
drop policy if exists gg_own on public.item_grants;       create policy gg_own on public.item_grants for select to authenticated using (user_id = auth.uid());
drop policy if exists gv_own on public.game_vaults;       create policy gv_own on public.game_vaults for select to authenticated using (user_id = auth.uid());
drop policy if exists gs_own on public.game_shield;       create policy gs_own on public.game_shield for select to authenticated using (user_id = auth.uid());
drop policy if exists gn_own on public.game_notes;        create policy gn_own on public.game_notes for select to authenticated using (user_id = auth.uid());
drop policy if exists gl_own on public.game_log;          create policy gl_own on public.game_log for select to authenticated using (actor = auth.uid() or target = auth.uid());
revoke insert, update, delete on public.game_config, public.game_items, public.game_players, public.game_inventory, public.item_grants,
  public.game_vaults, public.game_shield, public.game_notes, public.game_log from anon, authenticated;

-- ───────── 3. helpers ─────────
create or replace function public.game_cfg(p_k text) returns int language sql stable as $$ select v from public.game_config where k = p_k $$;
create or replace function public.game_week() returns timestamptz language sql stable as $$ select date_trunc('week', now() at time zone 'utc') at time zone 'utc' $$;
create or replace function public.game_bal(p_u uuid) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from orbit_ledger where user_id = p_u $$;
create or replace function public.game_locked(p_u uuid) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from game_vaults where user_id = p_u and ends_at > now() $$;
create or replace function public.game_lock2(a uuid, b uuid) returns void language plpgsql as $$   -- same lock the shop uses; two players always in uuid order, so no deadlock
begin
  if a < b then perform pg_advisory_xact_lock(hashtext('orbit-spend-' || a::text)); perform pg_advisory_xact_lock(hashtext('orbit-spend-' || b::text));
  else perform pg_advisory_xact_lock(hashtext('orbit-spend-' || b::text)); perform pg_advisory_xact_lock(hashtext('orbit-spend-' || a::text)); end if;
end $$;
create or replace function public.game_earned(p_u uuid) returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from orbit_ledger where user_id = p_u and amount > 0 and reason not in ('gift_in','gamble_win','theft_gain') $$;
create or replace function public.game_newcomer(p_u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select created_at from auth.users where id = p_u), now()) > now() - make_interval(days => game_cfg('newcomer_days'))
      or game_earned(p_u) < game_cfg('newcomer_earned') $$;
create or replace function public.game_item_week(p_u uuid, p_item text) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from item_grants where user_id = p_u and item_id = p_item and created_at >= game_week() $$;
revoke all on function public.game_bal(uuid), public.game_locked(uuid), public.game_lock2(uuid, uuid), public.game_earned(uuid), public.game_newcomer(uuid), public.game_item_week(uuid, text) from public, anon, authenticated;

-- ───────── 4. Vault-locked Orbits can't be spent by anything ─────────
create or replace function public.game_guard_spend() returns trigger language plpgsql security definer set search_path = public as $$
declare lk bigint;
begin
  if new.amount < 0 and new.reason <> 'theft_loss' then
    lk := game_locked(new.user_id);
    if lk > 0 and game_bal(new.user_id) + new.amount < lk then raise exception 'Some of your Orbits are locked in a Galactic Vault.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists game_guard_spend on public.orbit_ledger;
create trigger game_guard_spend before insert on public.orbit_ledger for each row execute function public.game_guard_spend();

-- stolen Orbits count in "Current" (wealth) but are not earned: leave them out of Day / Week / Month / All-time
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_rank bigint)
language sql stable security definer set search_path = public as $$
  with m as (select coalesce(p_days, 1) as d),
  cur as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then true
                when m.d = 0 then l.amount > 0 and l.reason not in ('gift_in', 'gamble_win', 'theft_gain')
                else l.amount > 0 and l.reason not in ('gift_in', 'gamble_win', 'theft_gain') and l.created_at >= now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then l.created_at < now() - interval '7 days'
                when m.d = 0 then l.amount > 0 and l.reason not in ('gift_in', 'gamble_win', 'theft_gain') and l.created_at < now() - interval '7 days'
                else l.amount > 0 and l.reason not in ('gift_in', 'gamble_win', 'theft_gain') and l.created_at >= now() - make_interval(days => 2 * m.d) and l.created_at < now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv_r as (select user_id, rank() over (order by t desc) as r from prv)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, prv_r.r
    from cur join profiles p on p.id = cur.user_id left join prv_r on prv_r.user_id = cur.user_id
   order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;

-- ───────── 5. the Loop is no longer for sale ─────────
create or replace function public.take_orbit_loop(p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin raise exception 'The Orbit Loop can''t be bought any more. Win it with a Sword of Stars.'; end $$;

create or replace function public._loop_move(p_to uuid, p_how text) returns void language plpgsql security definer set search_path = public as $$
declare old uuid;
begin
  select holder into old from orbit_loop where id = 1 for update;
  update orbit_loop set holder = p_to, price = 0, takes = takes + 1, taken_at = now() where id = 1;
  insert into orbit_loop_history (user_id, price, how) values (p_to, 0, p_how);
  if old is not null then update game_shield set active_until = now() where user_id = old; end if;
  insert into game_players (user_id) values (p_to) on conflict (user_id) do update set active = true, left_at = null;
end $$;
revoke all on function public._loop_move(uuid, text) from public, anon, authenticated;

create or replace function public.designate_loop(p_user uuid, p_ref text)   -- staff only: a designated event hands the Loop over
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Staff only.'; end if;
  perform _loop_move(p_user, 'event');
end $$;
revoke all on function public.designate_loop(uuid, text) from public, anon;
grant execute on function public.designate_loop(uuid, text) to authenticated;

-- ───────── 6. items: grant, buy ─────────
create or replace function public._grant_item(p_u uuid, p_item text, p_src text) returns boolean language plpgsql security definer set search_path = public as $$
declare it game_items;
begin
  select * into it from game_items where id = p_item; if not found then raise exception 'Unknown item.'; end if;
  if game_item_week(p_u, p_item) >= it.weekly_limit then return false; end if;   -- weekly limits don't accumulate
  insert into item_grants (user_id, item_id, source) values (p_u, p_item, p_src);
  insert into game_inventory (user_id, item_id, qty) values (p_u, p_item, 1) on conflict (user_id, item_id) do update set qty = game_inventory.qty + 1;
  return true;
end $$;
revoke all on function public._grant_item(uuid, text, text) from public, anon, authenticated;

create or replace function public.game_buy(p_item text) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it game_items;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into it from game_items where id = p_item; if not found then raise exception 'That item is not for sale.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if game_item_week(uid, p_item) >= it.weekly_limit then raise exception 'You''ve reached this week''s limit for the % (%).', it.name, it.weekly_limit; end if;
  if game_bal(uid) - game_locked(uid) < it.price then raise exception 'Not enough unlocked Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -it.price, 'spend', 'game_' || it.id || ':' || gen_random_uuid());
  perform _grant_item(uid, p_item, 'shop');
  return jsonb_build_object('balance', game_bal(uid));
end $$;

create or replace function public.award_game_item(p_user uuid, p_item text, p_source text)   -- staff: missions / events / tournaments. Over the weekly limit => Orbits instead
returns text language plpgsql security definer set search_path = public as $$
declare it game_items; refund int;
begin
  if not public.orbit_staff() then raise exception 'Staff only.'; end if;
  if p_source not in ('mission','event','tournament','gift') then raise exception 'Bad source.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || p_user::text));
  if _grant_item(p_user, p_item, p_source) then return 'item'; end if;
  select * into it from game_items where id = p_item;
  refund := greatest(1, it.price * game_cfg('reward_refund_pct') / 100);
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_user, refund, 'game_reward', 'gameitem:' || gen_random_uuid());
  return 'orbits';
end $$;
revoke all on function public.game_buy(text), public.award_game_item(uuid, text, text) from public, anon;
grant execute on function public.game_buy(text), public.award_game_item(uuid, text, text) to authenticated;

-- ───────── 7. join / leave / notes ─────────
create or replace function public.game_join() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p game_players;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into p from game_players where user_id = uid;
  if found and not p.active and p.left_at > now() - interval '24 hours' then raise exception 'You can rejoin 24 hours after leaving.'; end if;
  insert into game_players (user_id) values (uid) on conflict (user_id) do update set active = true, left_at = null, joined_at = now();
end $$;
create or replace function public.game_leave() returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if exists (select 1 from orbit_loop where id = 1 and holder = uid) then raise exception 'The Orbit Loop holder can''t leave the game.'; end if;
  if exists (select 1 from game_vaults where user_id = uid and ends_at > now()) then raise exception 'Wait for your Vault to unlock first.'; end if;
  update game_players set active = false, left_at = now() where user_id = uid;
end $$;
create or replace function public.game_note_save(p_target uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(p_note, ''));
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if n = '' then delete from game_notes where user_id = uid and target = p_target; return; end if;
  if char_length(n) > 280 then raise exception 'Notes are 280 characters at most.'; end if;
  if not exists (select 1 from game_notes where user_id = uid and target = p_target) and (select count(*) from game_notes where user_id = uid) >= 30 then raise exception 'You can keep 30 notes.'; end if;
  insert into game_notes (user_id, target, note) values (uid, p_target, n) on conflict (user_id, target) do update set note = excluded.note, updated_at = now();
end $$;
revoke all on function public.game_join(), public.game_leave(), public.game_note_save(uuid, text) from public, anon;
grant execute on function public.game_join(), public.game_leave(), public.game_note_save(uuid, text) to authenticated;

-- ───────── 8. my vault / shield ─────────
create or replace function public.use_vault(p_amount int) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); spendable bigint;
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
  insert into game_vaults (user_id, amount, ends_at) values (uid, p_amount, now() + interval '24 hours');
  return jsonb_build_object('locked', p_amount, 'ends_at', now() + interval '24 hours');
end $$;
create or replace function public.use_shield() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sh game_shield;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  perform 1 from orbit_loop where id = 1 and holder = uid for update;
  if not found then raise exception 'Only the Orbit Loop holder can use a Shield.'; end if;
  select * into sh from game_shield where user_id = uid;
  if found and sh.last_start > now() - interval '48 hours' then raise exception 'The Shield needs to recharge until %.', to_char(sh.last_start + interval '48 hours', 'Mon DD HH24:MI "UTC"'); end if;
  update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'shield' and qty > 0;
  if not found then raise exception 'You don''t have an Orbit Shield.'; end if;
  insert into game_shield (user_id, active_until, last_start) values (uid, now() + interval '24 hours', now())
    on conflict (user_id) do update set active_until = excluded.active_until, last_start = excluded.last_start;
  return jsonb_build_object('active_until', now() + interval '24 hours');
end $$;
revoke all on function public.use_vault(int), public.use_shield() from public, anon;
grant execute on function public.use_vault(int), public.use_shield() to authenticated;

-- ───────── 9. theft ─────────
-- why a player can't be a target right now (null = fine). Never mentions items or balances.
create or replace function public._game_block(p_actor uuid, p_target uuid) returns text language plpgsql security definer set search_path = public as $$
begin
  if p_actor = p_target then return 'That''s you.'; end if;
  if not exists (select 1 from game_players where user_id = p_target and active) then return 'Not playing the game.'; end if;
  if game_newcomer(p_target) then return 'New players are protected.'; end if;
  if exists (select 1 from game_log where kind = 'theft' and actor = p_actor and target = p_target and created_at > now() - interval '24 hours')
    then return 'Cooldown: you hit them in the last 24h.'; end if;
  return null;
end $$;
revoke all on function public._game_block(uuid, uuid) from public, anon, authenticated;

create or replace function public.attempt_theft(p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); why text; cost int := game_cfg('theft_cost'); amt int; unl bigint; lost_today int; tries int; day0 timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_target is null then raise exception 'Pick a target.'; end if;
  perform game_lock2(uid, p_target);
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if game_newcomer(uid) then raise exception 'New players can''t steal yet.'; end if;
  why := _game_block(uid, p_target); if why is not null then raise exception '%', why; end if;
  select count(*) into tries from game_log where kind = 'theft' and actor = uid and created_at >= day0;
  if tries >= game_cfg('theft_daily') then raise exception 'You''ve used all % theft attempts for today.', game_cfg('theft_daily'); end if;
  if game_bal(uid) - game_locked(uid) < cost then raise exception 'You need % unlocked Orbits to attempt a theft.', cost; end if;

  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -cost, 'theft_cost', 'theft:' || gen_random_uuid());   -- the cost is paid whatever happens

  update game_inventory set qty = qty - 1 where user_id = p_target and item_id = 'amulet' and qty > 0;
  if found then
    insert into game_log (kind, actor, target, outcome) values ('theft', uid, p_target, 'blocked');
    return jsonb_build_object('outcome', 'blocked', 'amount', 0, 'cost', cost, 'balance', game_bal(uid));
  end if;

  unl := greatest(0, game_bal(p_target) - game_locked(p_target));
  select coalesce(sum(amount), 0) into lost_today from game_log where kind = 'theft' and target = p_target and outcome = 'stolen' and created_at >= day0;
  amt := least(game_cfg('theft_cap'), (unl * game_cfg('theft_pct') / 100)::int, greatest(0, game_cfg('victim_daily_loss') - lost_today));
  if amt < 1 then
    insert into game_log (kind, actor, target, outcome) values ('theft', uid, p_target, 'empty');
    return jsonb_build_object('outcome', 'empty', 'amount', 0, 'cost', cost, 'balance', game_bal(uid));
  end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_target, -amt, 'theft_loss', 'theft:' || gen_random_uuid());
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt, 'theft_gain', 'theft:' || gen_random_uuid());
  insert into game_log (kind, actor, target, outcome, amount) values ('theft', uid, p_target, 'stolen', amt);
  update game_players set victories = victories + 1 where user_id = uid;
  return jsonb_build_object('outcome', 'stolen', 'amount', amt, 'cost', cost, 'balance', game_bal(uid));
end $$;

-- ───────── 10. investigate (game facts only; never messages or personal data) ─────────
create or replace function public.investigate(p_target uuid, p_compass boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cost int := game_cfg('investigate_cost'); pick int; clue text; kind text := case when p_compass then 'compass' else 'investigate' end;
        has_any boolean; has_vault boolean; has_amu boolean; has_shield boolean; locked bigint; n int; day0 timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
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
  select coalesce(sum(qty), 0) > 0 into has_any from game_inventory where user_id = p_target;
  select exists (select 1 from game_vaults where user_id = p_target and ends_at > now()) into has_vault;
  select exists (select 1 from game_inventory where user_id = p_target and item_id = 'amulet' and qty > 0) into has_amu;
  select exists (select 1 from game_shield where user_id = p_target and active_until > now()) into has_shield;
  locked := game_locked(p_target);
  if p_compass then
    pick := 1 + floor(random() * 4)::int;
    clue := case pick
      when 1 then case when has_amu then 'They are carrying a Mirror Amulet.' else 'They have no Mirror Amulet.' end
      when 2 then case when has_shield then 'A Shield is active around them right now.' else 'No Shield is active around them.' end
      when 3 then case when locked = 0 then 'Nothing of theirs is locked in a Vault.' when locked < 100 then 'Under 100 of their Orbits are locked in a Vault.' else 'At least 100 of their Orbits are locked in a Vault.' end
      else (select 'They hold ' || coalesce(sum(qty), 0) || CASE WHEN coalesce(sum(qty), 0) = 1 THEN ' item.' ELSE ' items in total.' END from game_inventory where user_id = p_target) end;
  else
    pick := 1 + floor(random() * 2)::int;
    clue := case pick
      when 1 then case when has_any then 'They are holding at least one item.' else 'They are holding no items.' end
      else case when has_vault then 'They have Orbits locked in a Vault.' else 'They have no Vault active.' end end;
  end if;
  insert into game_log (kind, actor, target, outcome) values (kind, uid, p_target, 'clue');
  update game_players set discoveries = discoveries + 1 where user_id = uid;
  return jsonb_build_object('clue', clue, 'compass', p_compass, 'balance', game_bal(uid));
end $$;
revoke all on function public.attempt_theft(uuid), public.investigate(uuid, boolean) from public, anon;
grant execute on function public.attempt_theft(uuid), public.investigate(uuid, boolean) to authenticated;

-- ───────── 11. Sword of Stars ─────────
create or replace function public.challenge_loop() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp orbit_loop; blocked boolean;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if not exists (select 1 from game_players where user_id = uid and active) then raise exception 'Join the game first.'; end if;
  if game_newcomer(uid) then raise exception 'New players can''t challenge yet.'; end if;
  select * into lp from orbit_loop where id = 1 for update;   -- one challenge at a time
  if lp.holder is null then raise exception 'Nobody holds the Loop yet. Staff hand it out at an event.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  update game_inventory set qty = qty - 1 where user_id = uid and item_id = 'sword' and qty > 0;
  if not found then raise exception 'You don''t have a Sword of Stars.'; end if;   -- the Sword is spent either way
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

-- ───────── 12. everything the page needs in one call (only YOUR items; others get yes/no eligibility and counts) ─────────
create or replace function public.game_state() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); me game_players; got boolean; day0 timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc'; r jsonb;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into me from game_players where user_id = uid; got := found;
  select jsonb_build_object(
    'joined', coalesce(me.active, false), 'rejoin_at', case when got and not me.active then me.left_at + interval '24 hours' end,
    'newcomer', game_newcomer(uid), 'balance', game_bal(uid), 'locked', game_locked(uid),
    'cfg', (select jsonb_object_agg(k, v) from game_config),
    'catalog', (select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'rarity', i.rarity, 'price', i.price, 'limit', i.weekly_limit, 'blurb', i.blurb, 'c1', i.c1, 'c2', i.c2, 'glyph', i.glyph,
                   'used', game_item_week(uid, i.id), 'qty', coalesce((select qty from game_inventory where user_id = uid and item_id = i.id), 0)) order by i.price) from game_items i),
    'week_resets', game_week() + interval '7 days',
    'vault', (select jsonb_build_object('amount', amount, 'ends_at', ends_at) from game_vaults where user_id = uid and ends_at > now() order by ends_at desc limit 1),
    'shield', (select jsonb_build_object('active_until', active_until, 'next_ok', last_start + interval '48 hours') from game_shield where user_id = uid),
    'attempts_today', (select count(*) from game_log where kind = 'theft' and actor = uid and created_at >= day0),
    'notes', coalesce((select jsonb_object_agg(target, note) from game_notes where user_id = uid), '{}'::jsonb),
    'loop', (select jsonb_build_object('holder', l.holder, 'name', p.display_name, 'since', l.taken_at, 'takes', l.takes,
               'history', coalesce((select jsonb_agg(jsonb_build_object('name', hp.display_name, 'at', h.taken_at, 'how', h.how) order by h.taken_at desc)
                                      from (select * from orbit_loop_history order by taken_at desc limit 5) h left join profiles hp on hp.id = h.user_id), '[]'::jsonb))
               from orbit_loop l left join profiles p on p.id = l.holder where l.id = 1),
    'players', coalesce((select jsonb_object_agg(g.user_id, jsonb_build_object('victories', g.victories, 'discoveries', g.discoveries, 'block', _game_block(uid, g.user_id))) from game_players g where g.active), '{}'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.game_state() from public, anon;
grant execute on function public.game_state() to authenticated;

-- ───────── 13. live updates, and the Intelligence Chat channel ─────────
do $$ begin
  begin alter publication supabase_realtime add table public.game_log; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

insert into public.channels (server_id, name, description, kind, position)
select s.id, 'orbit-intelligence', 'Game talk only: share clues, bluff, make deals. No private messages or personal info about anyone.', 'text', 90
  from public.servers s
 where not exists (select 1 from public.channels c where c.server_id = s.id and c.name = 'orbit-intelligence')
 limit 1;
