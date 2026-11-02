-- Run AFTER migration-orbit-game.sql and migration-orbit-game-v2.sql in the
-- Orbit Supabase SQL Editor. Apply this file last; older migrations re-enable
-- purchases. No frontend deployment can apply these database changes.
-- Restores the Loop to the verified 30yua school account ONCE, records the
-- restoration, and retires purchases and staff event transfers. Later valid
-- Sword wins are preserved when this migration is run again.
begin;

do $$ begin
  if to_regprocedure('public.challenge_loop()') is null
     or to_regprocedure('public._loop_move(uuid,text,integer)') is null then
    raise exception 'Apply migration-orbit-game.sql and migration-orbit-game-v2.sql first.';
  end if;
end $$;

-- Old clients and direct RPC calls cannot purchase the Loop, at any price.
create or replace function public.take_orbit_loop(p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'The Orbit Loop is not for sale. Only a Sword of Stars challenge can win it.';
end $$;
revoke all on function public.take_orbit_loop(int) from public, anon, authenticated;

-- Event handovers are retired too: ordinary transfers must pass challenge_loop.
create or replace function public.designate_loop(p_user uuid, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Only a Sword of Stars challenge can win the Orbit Loop.';
end $$;
revoke all on function public.designate_loop(uuid,text) from public, anon, authenticated;

-- Internal movement is not an RPC entry point. challenge_loop below is its
-- only player-accessible caller; it consumes the Sword before invoking this.
drop function if exists public._loop_move(uuid,text);
create or replace function public._loop_move(p_to uuid, p_how text, p_price int default null)
returns void language plpgsql security definer set search_path = public as $$
declare previous_holder uuid;
begin
  if p_how is distinct from 'challenge' or p_price is not null
     or auth.uid() is null or p_to is distinct from auth.uid() then
    raise exception 'Only a Sword of Stars challenge can transfer the Orbit Loop.';
  end if;
  select holder into previous_holder from public.orbit_loop where id = 1 for update;
  if not found then raise exception 'The Orbit Loop is not set up yet.'; end if;
  update public.orbit_loop set holder = p_to, price = 0,
    takes = takes + 1, taken_at = now() where id = 1;
  insert into public.orbit_loop_history(user_id,price,how) values(p_to,0,'challenge');
  if previous_holder is not null then
    update public.game_shield set active_until = now() where user_id = previous_holder;
  end if;
  insert into public.game_players(user_id) values(p_to)
    on conflict(user_id) do update set active = true, left_at = null;
end $$;
revoke all on function public._loop_move(uuid,text,int) from public, anon, authenticated;

-- Authorization lives in SQL, not in whether a browser button is disabled.
create or replace function public.challenge_loop()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); lp public.orbit_loop; blocked boolean;
        cd int := public.game_cfg('sword_cooldown_days'); last_c timestamptz;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if not exists(select 1 from public.game_players where user_id = uid and active) then
    raise exception 'Join the game first.';
  end if;
  if public.game_newcomer(uid) then raise exception 'New players can''t challenge yet.'; end if;
  select max(created_at) into last_c from public.game_log where kind = 'challenge' and actor = uid;
  if last_c is not null and last_c > now() - make_interval(days => cd) then
    raise exception 'Your Sword challenge is still on cooldown.';
  end if;
  select * into lp from public.orbit_loop where id = 1 for update;
  if not found or lp.holder is null then raise exception 'Nobody holds the Orbit Loop yet.'; end if;
  if lp.holder = uid then raise exception 'You already hold the Orbit Loop.'; end if;
  update public.game_inventory set qty = qty - 1
    where user_id = uid and item_id = 'sword' and qty > 0;
  if not found then raise exception 'You don''t have a Sword of Stars.'; end if;
  update public.game_sword set holder = null where id = 1 and holder = uid;
  select exists(select 1 from public.game_shield
    where user_id = lp.holder and active_until > now()) into blocked;
  if blocked then
    insert into public.game_log(kind,actor,target,outcome) values('challenge',uid,lp.holder,'blocked');
    return jsonb_build_object('outcome','blocked');
  end if;
  perform public._loop_move(uid,'challenge');
  insert into public.game_log(kind,actor,target,outcome) values('challenge',uid,lp.holder,'transferred');
  update public.game_players set victories = victories + 1 where user_id = uid;
  return jsonb_build_object('outcome','transferred');
end $$;
revoke all on function public.challenge_loop() from public, anon;
grant execute on function public.challenge_loop() to authenticated;

-- Only the migration administrator can access the one-time restoration marker.
create table if not exists public.orbit_loop_migrations(
  id text primary key, applied_at timestamptz not null default now()
);
alter table public.orbit_loop_migrations enable row level security;
revoke all on public.orbit_loop_migrations from public, anon, authenticated;
revoke insert,update,delete on public.orbit_loop,public.orbit_loop_history from public,anon,authenticated;

do $restore$
declare owner_id uuid; previous_holder uuid; applied text;
begin
  insert into public.orbit_loop_migrations(id) values('sword-only-restore-30yua-v1')
    on conflict(id) do nothing returning id into applied;
  if applied is null then return; end if;
  -- Match the protected login identity, never an editable display name.
  select u.id into owner_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = '30yua@tesdk12.net';
  if owner_id is null then
    raise exception '30yua must have an Orbit account/profile before this migration can restore the Loop.';
  end if;
  select holder into previous_holder from public.orbit_loop where id = 1 for update;
  if not found then raise exception 'The Orbit Loop is not set up yet.'; end if;
  if previous_holder is distinct from owner_id then
    update public.orbit_loop set holder = owner_id, price = 0,
      takes = takes + 1, taken_at = now() where id = 1;
    insert into public.orbit_loop_history(user_id,price,how) values(owner_id,0,'restored');
    if previous_holder is not null then
      update public.game_shield set active_until = now() where user_id = previous_holder;
    end if;
  end if;
  insert into public.game_players(user_id) values(owner_id)
    on conflict(user_id) do update set active = true, left_at = null;
end $restore$;

notify pgrst, 'reload schema';
commit;
