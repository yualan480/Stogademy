-- Orbit Games: a single round can now pay up to 100,000 Orbits (was 20,000), and Ethan gets 43,528 Orbits.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run: the cap is just replaced, and Ethan's grant is only added once.

-- ───────── 1. round payout cap: 20,000 -> 100,000 ─────────
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
  amt := least((p_score * permille + 500) / 1000, 100000);
  if amt < 1 then return 0; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt::int, 'game', p_game || ':' || btrim(p_ref))
    on conflict (user_id, reason, ref) do nothing;
  return amt::int;
end $$;
revoke all on function public.claim_game_orbits(text, bigint, text) from public;
grant execute on function public.claim_game_orbits(text, bigint, text) to authenticated;

-- ───────── 2. give Ethan Soong 43,528 Orbits (once) ─────────
-- 'staff_event' is an EARNED reason, so the grant is added to his Orbit count (my_orbits / shop balance) AND is counted by
-- the Orbit Leaderboard in every view: Day, Week, Month, All-time and Current.
-- Finds the member called "Ethan Soong" (display name, or a username that starts with ethansoong / ethan_soong).
-- If zero or several members match, it stops with a message instead of guessing: put his exact username in the where clause.
do $$
declare n int; uid uuid; who text;
begin
  select count(*) into n from public.profiles p
    where lower(btrim(p.display_name)) = 'ethan soong' or lower(p.username) like 'ethan%soong%';
  if n = 0 then raise exception 'No member named Ethan Soong found. Use his exact username (select username, display_name from profiles where display_name ilike ''%ethan%'').'; end if;
  if n > 1 then raise exception '% members match Ethan Soong. Use his exact username instead.', n; end if;
  select p.id, p.display_name into uid, who from public.profiles p
    where lower(btrim(p.display_name)) = 'ethan soong' or lower(p.username) like 'ethan%soong%';
  insert into public.orbit_ledger (user_id, amount, reason, ref)
    values (uid, 43528, 'staff_event', 'owner grant: 43,528 Orbits for Ethan Soong')
    on conflict (user_id, reason, ref) do nothing;
  raise notice 'Gave % 43,528 Orbits (skipped if already given).', who;
end $$;

-- check: his Orbit count and where he stands on the leaderboard (All-time = 0, Current = -1)
select p.display_name, public.game_bal(p.id) as orbit_count
  from public.profiles p where lower(btrim(p.display_name)) = 'ethan soong' or lower(p.username) like 'ethan%soong%';
