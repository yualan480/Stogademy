-- Orbit cartridge games: remove fixed per-round Orbit payout caps.
-- Run this LAST in the Orbit Supabase SQL Editor, after game_rates is set up.
-- Preserves the owner's current rates, score validation, 15-second per-game
-- cooldown, and one payout per round reference. Does not re-credit past rounds.
-- Safe to rerun. No grants, rate resets or other reward changes are included.
begin;

-- The old ledger-wide amount check would otherwise reject game rewards over
-- 1,000,000. Permit larger positive GAME rewards while keeping its existing
-- limits for every other reason and for negative entries.
alter table public.orbit_ledger
  drop constraint if exists orbit_ledger_amount_check;
alter table public.orbit_ledger
  add constraint orbit_ledger_amount_check check (
    amount <> 0 and (
      amount between -1000000 and 1000000
      or (reason = 'game' and amount > 0)
    )
  );

create or replace function public.claim_game_orbits(
  p_game text, p_score bigint, p_ref text
)
returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  permille int;
  amt bigint;
  credited int;
  last_at timestamptz;
begin
  if uid is null then return 0; end if;
  select r.permille into permille
    from public.game_rates r where r.game = p_game;
  if permille is null or p_score is null or p_score <= 0
     or p_score > 10000000 then return 0; end if;
  if coalesce(btrim(p_ref), '') = '' or char_length(p_ref) > 80 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('orbit-game-' || uid::text));
  select max(created_at) into last_at from public.orbit_ledger
    where user_id = uid and reason = 'game' and ref like p_game || ':%';
  if last_at is not null and now() - last_at < interval '15 seconds' then
    return 0;
  end if;

  -- No least(...,20000) or least(...,100000): pay the full rounded rate.
  -- Current validated score/rate ranges yield at most 1 billion, fitting int.
  amt := (p_score * permille::bigint + 500) / 1000;
  if amt < 1 then return 0; end if;

  insert into public.orbit_ledger(user_id,amount,reason,ref)
    values(uid,amt::int,'game',p_game || ':' || btrim(p_ref))
    on conflict(user_id,reason,ref) do nothing
    returning amount into credited;
  -- A retried round never reports an award that was not inserted.
  return coalesce(credited,0);
end $$;
revoke all on function public.claim_game_orbits(text,bigint,text)
  from public, anon;
grant execute on function public.claim_game_orbits(text,bigint,text)
  to authenticated;

notify pgrst, 'reload schema';
commit;
