-- The Orbit Loop: ONE item in the whole shop. Whoever pays the highest price takes it from the current holder.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-orbits-unified.sql (it spends from the same Orbits ledger as the rest of the shop).
--
--  orbit_loop          exactly one row: who holds the loop now and the price they paid. Everyone can read it, nobody can write it directly.
--  orbit_loop_history  every take (who, how much, when). Everyone can read it.
--  take_orbit_loop     the only way to take it. The first take must be at least 100 Orbits, every later take must be MORE than the last price.
--                      The server checks the price and the balance, so editing the page in the browser can never get it for free.
--                      Spending never lowers leaderboard rank (same 'spend' rows as every other shop purchase).

-- ───────── 1. tables ─────────
create table if not exists public.orbit_loop (
  id          int primary key check (id = 1),
  holder      uuid references auth.users(id) on delete set null,
  price       int  not null default 0 check (price between 0 and 1000000),   -- what the current holder paid (0 = never taken yet)
  start_price int  not null default 100 check (start_price between 1 and 1000000),
  takes       int  not null default 0,
  taken_at    timestamptz
);
insert into public.orbit_loop (id) values (1) on conflict (id) do nothing;

create table if not exists public.orbit_loop_history (
  id       bigint generated always as identity primary key,
  user_id  uuid references auth.users(id) on delete set null,
  price    int not null,
  taken_at timestamptz not null default now()
);
create index if not exists orbit_loop_history_time on public.orbit_loop_history (taken_at desc);

alter table public.orbit_loop enable row level security;
alter table public.orbit_loop_history enable row level security;
drop policy if exists ol_read on public.orbit_loop;
create policy ol_read on public.orbit_loop for select to authenticated using (true);
drop policy if exists olh_read on public.orbit_loop_history;
create policy olh_read on public.orbit_loop_history for select to authenticated using (true);
revoke insert, update, delete on public.orbit_loop, public.orbit_loop_history from anon, authenticated;

-- ───────── 2. take it ─────────
create or replace function public.take_orbit_loop(p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp orbit_loop; bal bigint; need int;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_price is null or p_price < 1 then raise exception 'Type a price in Orbits.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));   -- same lock the shop uses, so two buys can never overspend
  select * into lp from orbit_loop where id = 1 for update;               -- one take at a time: two people can never both win the same price
  if not found then raise exception 'The Orbit Loop is not set up yet.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  need := case when lp.takes = 0 then lp.start_price else lp.price + 1 end;
  if p_price < need then raise exception 'You need to pay at least % Orbits to take the Orbit Loop.', need; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_price then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_price, 'spend', 'loop:' || gen_random_uuid());
  update orbit_loop set holder = uid, price = p_price, takes = takes + 1, taken_at = now() where id = 1;
  insert into orbit_loop_history (user_id, price) values (uid, p_price);
  return jsonb_build_object('balance', bal - p_price, 'price', p_price, 'holder', uid);
end $$;
revoke all on function public.take_orbit_loop(int) from public, anon;
grant execute on function public.take_orbit_loop(int) to authenticated;

-- ───────── 3. live updates (everyone sees the loop change hands without refreshing) ─────────
do $$ begin
  begin alter publication supabase_realtime add table public.orbit_loop; exception when duplicate_object then null; when undefined_object then null; end;
end $$;
