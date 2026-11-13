-- Sword of Stars: ONE random draw each UTC day (00:00 UTC), free to enter.
-- Apply AFTER migration-orbit-game-v2.sql and migration-loop-sword-only.sql.
-- Draw can run from pg_cron or when a member opens the Orbit game page.
-- The previous unused Sword expires at the next successful daily draw.
-- No shop purchase, fee, bet, or staff award is involved.

begin;

alter table public.game_sword
  add column if not exists draw_date date not null default date '1970-01-01';

-- A player can be randomly picked more than once in a week, but only one
-- Sword is circulating at any moment and at most one new Sword is drawn per day.
update public.game_items set
  weekly_limit = 7,
  blurb = 'Free daily random draw at 00:00 UTC among eligible active players. One Sword exists at a time; unused Swords expire at the next draw. Challenge the Loop holder to try to win it.'
where id = 'sword';

create or replace function public._sword_pick(p_exclude uuid)
returns uuid language sql volatile security definer set search_path = public as $$
  select g.user_id from public.game_players g
  where g.active
    and g.user_id is distinct from p_exclude
    and g.user_id is distinct from (select holder from public.orbit_loop where id=1)
    and not public.game_newcomer(g.user_id)
    and public.game_last_seen(g.user_id) > now() - make_interval(days => public.game_cfg('sword_idle_days'))
  order by random() limit 1
$$;

create or replace function public._sword_tick()
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  today_utc date := (now() at time zone 'UTC')::date;
  sw public.game_sword%rowtype;
  winner uuid;
begin
  perform pg_advisory_xact_lock(hashtext('orbit-sword'));
  select * into sw from public.game_sword where id = 1 for update;
  if not found then raise exception 'The Sword draw is not set up.'; end if;
  if sw.draw_date >= today_utc then return; end if;

  winner := public._sword_pick(null);
  if winner is null then return; end if; -- retry on the next tick if nobody qualifies

  -- Old unused Swords, including any legacy duplicates, expire before the
  -- daily winner receives the sole Sword. The entire change is atomic.
  update public.game_inventory set qty=0 where item_id='sword' and qty>0;
  insert into public.item_grants(user_id,item_id,source)
    values(winner,'sword','draw');
  insert into public.game_inventory(user_id,item_id,qty)
    values(winner,'sword',1)
    on conflict(user_id,item_id) do update set qty=1;
  update public.game_sword set
    holder=winner, assigned_at=now(), draw_date=today_utc,
    week_start=public.game_week()
  where id=1;
end $$;

revoke all on function public._sword_pick(uuid), public._sword_tick() from public, anon, authenticated;

-- Keep the prohibited-purchase message consistent with the draw schedule.
create or replace function public.game_buy(p_item text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); it public.game_items;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into it from public.game_items where id=p_item;
  if not found then raise exception 'That item is not for sale.'; end if;
  if it.id='sword' then raise exception 'The Sword of Stars cannot be bought. It is awarded in a free daily random draw.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if public.game_item_week(uid,p_item)>=it.weekly_limit then
    raise exception 'You''ve reached this week''s limit for the % (%).',it.name,it.weekly_limit;
  end if;
  if public.game_bal(uid)-public.game_locked(uid)<it.price then
    raise exception 'Not enough unlocked Orbits.';
  end if;
  insert into public.orbit_ledger(user_id,amount,reason,ref)
    values(uid,-it.price,'spend','game_' || it.id || ':' || gen_random_uuid());
  perform public._grant_item(uid,p_item,'shop');
  return jsonb_build_object('balance',public.game_bal(uid));
end $$;
revoke all on function public.game_buy(text) from public,anon;
grant execute on function public.game_buy(text) to authenticated;

-- Staff still cannot bypass the random selection by granting this item.
create or replace function public.award_game_item(p_user uuid,p_item text,p_source text)
returns text language plpgsql security definer set search_path=public as $$
declare it public.game_items; refund int;
begin
  if not public.orbit_staff() then raise exception 'Staff only.'; end if;
  if p_item='sword' then
    raise exception 'The Sword of Stars is awarded only by the daily random draw.';
  end if;
  if p_source not in ('mission','event','tournament','gift') then raise exception 'Bad source.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || p_user::text));
  if public._grant_item(p_user,p_item,p_source) then return 'item'; end if;
  select * into it from public.game_items where id=p_item;
  refund:=greatest(1,it.price*public.game_cfg('reward_refund_pct')/100);
  insert into public.orbit_ledger(user_id,amount,reason,ref)
    values(p_user,refund,'game_reward','gameitem:' || gen_random_uuid());
  return 'orbits';
end $$;
revoke all on function public.award_game_item(uuid,text,text) from public,anon;
grant execute on function public.award_game_item(uuid,text,text) to authenticated;

-- pg_cron is already enabled in the Orbit Chat project.
-- Calls the same locked/once-per-day function that game_state() uses as fallback.
select cron.schedule(
  'orbit-sword-stars-daily',
  '0 0 * * *',
  'select public._sword_tick();'
);

-- Give today's first daily Sword immediately, with no need to wait for
-- another member to open the game page.
select public._sword_tick();
commit;
