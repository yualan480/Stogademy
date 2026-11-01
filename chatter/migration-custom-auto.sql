-- Orbit Shop: custom orders are now made automatically (no owner approval).
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER migration-shop-v2.sql and migration-profanity-filter-2.sql.
--
--  * A custom order is checked by the swear-word filter the moment it is sent. If the name or description is not
--    appropriate it is refused and NOTHING is charged.
--  * If it passes, the 5,000 Orbits are taken and the item "generates" for 5 minutes (status 'generating', ready_at).
--  * When the 5 minutes are up the item is added to the person's items by the SERVER, so it does not matter if they
--    left the site. It is made (a) by a pg_cron job every minute if that extension can be enabled, and (b) the next time
--    the person opens Orbit, whichever comes first.
--  * The text is checked a second time right before the item is made. If it fails then, the Orbits are given back.
--  * The owner/admin approve and reject buttons are gone. reject_custom_item still works from the SQL Editor as an
--    emergency "pull this order and refund it" (it now also accepts orders that are still generating).

-- ───────── 1. new status + ready time ─────────
alter table public.shop_requests add column if not exists ready_at timestamptz;
alter table public.shop_requests drop constraint if exists shop_requests_status_check;
alter table public.shop_requests add constraint shop_requests_status_check check (status in ('pending','generating','approved','rejected'));
create index if not exists shop_requests_ready on public.shop_requests (status, ready_at);

-- orders that were still waiting for approval under the old system just start generating now
update public.shop_requests set status = 'generating', ready_at = now() where status = 'pending';

-- ───────── 2. the automatic appropriateness check ─────────
-- True when the name, the description and the emoji are all fine.
create or replace function public.custom_text_ok(p_name text, p_details text, p_glyph text default '')
returns boolean language plpgsql stable security definer set search_path = public as $f$
begin
  if public.name_is_blocked(p_name) or public.name_is_blocked(p_glyph) then return false; end if;
  if public.mask_profanity(coalesce(p_details, '')) is distinct from coalesce(p_details, '') then return false; end if;
  if public.mask_profanity(coalesce(p_name, ''))    is distinct from coalesce(p_name, '')    then return false; end if;
  return true;
end $f$;
revoke all on function public.custom_text_ok(text, text, text) from public, anon, authenticated;

-- ───────── 3. sending an order: check first, charge only if it passes, then 5 minutes ─────────
create or replace function public.submit_custom_item(p_kind text, p_name text, p_details text, p_art jsonb)
returns bigint language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); rid uuid := gen_random_uuid(); bal bigint; nm text := btrim(coalesce(p_name, '')); dt text := btrim(coalesce(p_details, ''));
        c1 text := coalesce(p_art->>'c1', '#2f6bff'); c2 text := coalesce(p_art->>'c2', '#37e0ff'); sh text := coalesce(p_art->>'shape', ''); gl text := coalesce(p_art->>'glyph', '');
        clean jsonb;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_kind not in ('frame','trail','theme','companion','collectible','cursor','font') then raise exception 'Pick what you want made.'; end if;
  if char_length(nm) < 1 or char_length(nm) > 30 then raise exception 'Give it a name (up to 30 letters).'; end if;
  if char_length(dt) < 3 or char_length(dt) > 300 then raise exception 'Describe what you want (3 to 300 letters).'; end if;
  if c1 !~* '^#[0-9a-f]{6}$' or c2 !~* '^#[0-9a-f]{6}$' then raise exception 'Pick two colours.'; end if;
  if sh !~ '^[a-z]{2,10}$' then raise exception 'Pick a style.'; end if;
  if char_length(gl) > 4 then gl := left(gl, 4); end if;
  -- the appropriateness check happens BEFORE any Orbits are taken
  if not public.custom_text_ok(nm, dt, gl) then raise exception 'That name or description is not appropriate for Orbit. Change it and try again. You were not charged.'; end if;
  clean := jsonb_build_object('c1', lower(c1), 'c2', lower(c2), 'shape', sh, 'glyph', gl, 'tile', coalesce(nullif(p_art->>'tile', ''), 'circle'));
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if (select count(*) from shop_requests where user_id = uid and status in ('pending','generating')) >= 3 then raise exception 'You already have 3 custom items generating. Wait for one to finish first.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < 5000 then raise exception 'A custom item costs 5,000 Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -5000, 'spend', 'custom:' || rid);
  insert into shop_requests (id, user_id, kind, name, details, art, status, ready_at) values (rid, uid, p_kind, nm, dt, clean, 'generating', now() + interval '5 minutes');
  return bal - 5000;
end $f$;
revoke all on function public.submit_custom_item(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_custom_item(text, text, text, jsonb) to authenticated;

-- ───────── 4. finishing one order that is due (used by the per-person call and by the cron job) ─────────
-- returns 'made', 'refunded' or null (nothing to do)
create or replace function public._finish_custom_request(p_id uuid)
returns text language plpgsql security definer set search_path = public as $f$
declare r shop_requests; iid text;
begin
  select * into r from shop_requests where id = p_id for update skip locked;
  if not found or r.status not in ('generating','pending') or coalesce(r.ready_at, now()) > now() then return null; end if;
  if not public.custom_text_ok(r.name, r.details, coalesce(r.art->>'glyph', '')) then
    -- failed the second check: give the Orbits back (removing the spend row keeps the leaderboard unchanged)
    perform pg_advisory_xact_lock(hashtext('orbit-spend-' || r.user_id::text));
    delete from orbit_ledger where user_id = r.user_id and reason = 'spend' and ref = 'custom:' || r.id;
    update shop_requests set status = 'rejected', note = 'Not appropriate for Orbit. Your Orbits were returned.', decided_at = now() where id = r.id;
    return 'refunded';
  end if;
  iid := public._make_custom_item(r.user_id, r.kind, r.name, 'Custom made just for you.', r.art);
  update shop_requests set status = 'approved', item_id = iid, note = 'Generated automatically.', decided_at = now() where id = r.id;
  return 'made';
end $f$;
revoke all on function public._finish_custom_request(uuid) from public, anon, authenticated;

-- the signed-in person's own finished orders (the app calls this whenever Orbit opens and when a timer ends)
create or replace function public.collect_custom_items()
returns jsonb language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); rid uuid; res text; made int := 0; refunded int := 0;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  for rid in select id from shop_requests where user_id = uid and status in ('generating','pending') and coalesce(ready_at, now()) <= now() order by created_at loop
    res := public._finish_custom_request(rid);
    if res = 'made' then made := made + 1; elsif res = 'refunded' then refunded := refunded + 1; end if;
  end loop;
  return jsonb_build_object('made', made, 'refunded', refunded);
end $f$;
revoke all on function public.collect_custom_items() from public, anon;
grant execute on function public.collect_custom_items() to authenticated;

-- everyone's finished orders (only for the cron job, never callable from the app)
create or replace function public.collect_all_custom_items()
returns int language plpgsql security definer set search_path = public as $f$
declare rid uuid; n int := 0;
begin
  for rid in select id from shop_requests where status in ('generating','pending') and coalesce(ready_at, now()) <= now() order by ready_at limit 200 loop
    if public._finish_custom_request(rid) is not null then n := n + 1; end if;
  end loop;
  return n;
end $f$;
revoke all on function public.collect_all_custom_items() from public, anon, authenticated;

-- ───────── 5. emergency pull from the SQL Editor: works on generating orders too ─────────
create or replace function public.reject_custom_item(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $f$
declare r shop_requests;
begin
  if not public.shop_admin() then raise exception 'Only the owner and admins can reject custom items.'; end if;
  select * into r from shop_requests where id = p_request for update;
  if not found or r.status not in ('pending','generating') then raise exception 'That order is not waiting any more.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || r.user_id::text));
  delete from orbit_ledger where user_id = r.user_id and reason = 'spend' and ref = 'custom:' || r.id;
  update shop_requests set status = 'rejected', note = left(coalesce(p_note, ''), 200), decided_at = now() where id = r.id;
end $f$;
revoke all on function public.reject_custom_item(uuid, text) from public, anon;
grant execute on function public.reject_custom_item(uuid, text) to authenticated;

-- ───────── 6. optional: let the SERVER finish orders every minute even if nobody opens Orbit ─────────
-- (if pg_cron cannot be enabled on your plan, nothing breaks: orders are finished the next time the person opens Orbit)
do $cron$
begin
  create extension if not exists pg_cron;
  begin perform cron.unschedule('orbit-custom-items'); exception when others then null; end;
  perform cron.schedule('orbit-custom-items', '* * * * *', 'select public.collect_all_custom_items()');
  raise notice 'pg_cron job orbit-custom-items scheduled (every minute).';
exception when others then
  raise notice 'pg_cron is not available (%). Orders will finish when the person next opens Orbit.', sqlerrm;
end $cron$;
