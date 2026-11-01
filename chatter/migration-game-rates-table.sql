-- Orbit Games payout rates now live in a table the OWNER can change from the Orbit Games admin panel (Payouts tab).
-- Run once in the ORBIT Supabase SQL Editor (the project with orbit_ledger). Safe to re-run: re-running resets the rates to the values below.
-- permille = Orbits per 1000 score points. 750 = 75%, 10000 = 1000%.  Block Out is removed.

create table if not exists public.game_rates (
  game text primary key,
  permille int not null check (permille >= 1 and permille <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.game_rates enable row level security;
drop policy if exists game_rates_read on public.game_rates;
create policy game_rates_read on public.game_rates for select using (true);
revoke all on public.game_rates from public, anon, authenticated;
grant select on public.game_rates to anon, authenticated;   -- nobody can write directly; only set_game_rate (owner) below

delete from public.game_rates where game = 'blockout';
insert into public.game_rates (game, permille) values
  ('blockblast', 750), ('game2048', 250), ('breakout', 500), ('dino', 500), ('flappy', 10000),
  ('geodash', 1000), ('minesweeper', 500), ('pacman', 100), ('slope', 1000), ('snake', 20000),
  ('tetris', 50), ('girder', 50)
on conflict (game) do update set permille = excluded.permille, updated_at = now();

-- everyone (even signed out) can read the current rates so the games can show them
create or replace function public.get_game_rates()
returns table (game text, permille int) language sql stable security definer set search_path = public as $$
  select game, permille from public.game_rates order by game $$;
revoke all on function public.get_game_rates() from public;
grant execute on function public.get_game_rates() to anon, authenticated;

-- ONLY the owner can change a rate (checked here on the server, so editing the page can't get around it)
create or replace function public.set_game_rate(p_game text, p_permille int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_owner() then raise exception 'Only the owner can change game payouts.'; end if;
  if p_permille is null or p_permille < 1 or p_permille > 100000 then raise exception 'The percentage must be between 0.1%% and 10000%%.'; end if;
  update public.game_rates set permille = p_permille, updated_at = now() where game = p_game;
  if not found then raise exception 'Unknown game.'; end if;
end $$;
revoke all on function public.set_game_rate(text, int) from public, anon;
grant execute on function public.set_game_rate(text, int) to authenticated;

-- paying a round now reads the table (no more hard-coded list)
create or replace function public.claim_game_orbits(p_game text, p_score bigint, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); permille int; amt bigint; last_at timestamptz;
begin
  if uid is null then return 0; end if;
  select r.permille into permille from public.game_rates r where r.game = p_game;
  if permille is null or p_score is null or p_score <= 0 or p_score > 10000000 then return 0; end if;
  if coalesce(btrim(p_ref), '') = '' or char_length(p_ref) > 80 then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-game-' || uid::text));
  select max(created_at) into last_at from orbit_ledger
    where user_id = uid and reason = 'game' and ref like p_game || ':%';
  if last_at is not null and now() - last_at < interval '15 seconds' then return 0; end if;
  amt := least((p_score * permille + 500) / 1000, 20000);
  if amt < 1 then return 0; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt::int, 'game', p_game || ':' || btrim(p_ref))
    on conflict (user_id, reason, ref) do nothing;
  return amt::int;
end $$;
revoke all on function public.claim_game_orbits(text, bigint, text) from public;
grant execute on function public.claim_game_orbits(text, bigint, text) to authenticated;
