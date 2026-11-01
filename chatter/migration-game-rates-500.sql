-- Game payouts retuned so a medium score pays about 500 Orbits. All 13 cartridges pay, Girder Gorilla included.
-- Run once in the ORBIT Supabase SQL Editor. Safe to re-run. Rounds already paid are not changed.
create or replace function public.claim_game_orbits(p_game text, p_score bigint, p_ref text)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); permille int; amt bigint; last_at timestamptz;
begin
  if uid is null then return 0; end if;
  permille := case p_game
    when 'game2048' then 100
    when 'blockblast' then 330
    when 'breakout' then 150
    when 'blockout' then 80
    when 'dino' then 1250
    when 'flappy' then 10000
    when 'geodash' then 1000
    when 'minesweeper' then 200
    when 'pacman' then 170
    when 'slope' then 330
    when 'snake' then 10000
    when 'tetris' then 15
    when 'girder' then 60
    else null end;
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
