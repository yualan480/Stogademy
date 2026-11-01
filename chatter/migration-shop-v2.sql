-- Orbit Shop v2: Text Fonts, many new shapes/styles, and Custom orders (5,000 Orbits).
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER migration-orbit-shop.sql and migration-shop-cursors.sql.
--
--  * new item kind 'font' (your display name gets the font everywhere in Orbit)
--  * shop_items.art now also holds a "shape" (frame silhouette, click-effect shape, theme style, companion motion, collectible holder, font style)
--  * shop_items.for_user: an item made just for one person (custom). It is never for sale.
--  * shop_requests: custom orders. A person types what they want and pays 5,000 Orbits. The owner/admins approve it
--    (it is added to that person's items) or reject it (the 5,000 Orbits are given back, and the leaderboard is never affected).
--  * grant_custom_item: lets the owner/admin add a custom item to someone by hand (SQL Editor or the shop).

-- ───────── 1. new kind + custom owner column ─────────
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('frame','trail','theme','companion','collectible','cursor','font'));
alter table public.shop_items add column if not exists for_user uuid references auth.users(id) on delete cascade;

create or replace function public.shop_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.server_role(public.main_server()) in ('owner', 'admin'), false) $$;

-- custom items can never be bought by anyone
create or replace function public.buy_shop_item(p_item text)
returns bigint language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); it shop_items; bal bigint;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into it from shop_items where id = p_item and active and for_user is null;
  if not found then raise exception 'That item is not for sale.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if exists (select 1 from shop_inventory where user_id = uid and item_id = it.id) then raise exception 'You already own this.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < it.price then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -it.price, 'spend', 'shop_' || it.id || ':' || gen_random_uuid());
  insert into shop_inventory (user_id, item_id) values (uid, it.id);
  return bal - it.price;
end $f$;
revoke all on function public.buy_shop_item(text) from public, anon;
grant execute on function public.buy_shop_item(text) to authenticated;

-- ───────── 2. custom orders ─────────
create table if not exists public.shop_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('frame','trail','theme','companion','collectible','cursor','font')),
  name       text not null check (char_length(name) between 1 and 30),
  details    text not null default '' check (char_length(details) <= 300),
  art        jsonb not null default '{}'::jsonb,
  price      int  not null default 5000,
  status     text not null default 'pending' check (status in ('pending','approved','rejected')),
  item_id    text,
  note       text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists shop_requests_status on public.shop_requests (status, created_at);
alter table public.shop_requests enable row level security;
drop policy if exists sreq_read on public.shop_requests;
create policy sreq_read on public.shop_requests for select to authenticated using (user_id = auth.uid() or public.shop_admin());
revoke insert, update, delete on public.shop_requests from anon, authenticated;

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
  clean := jsonb_build_object('c1', lower(c1), 'c2', lower(c2), 'shape', sh, 'glyph', gl, 'tile', coalesce(nullif(p_art->>'tile', ''), 'circle'));
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));
  if (select count(*) from shop_requests where user_id = uid and status = 'pending') >= 3 then raise exception 'You already have 3 custom orders waiting. Wait for one to be approved first.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < 5000 then raise exception 'A custom item costs 5,000 Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -5000, 'spend', 'custom:' || rid);
  insert into shop_requests (id, user_id, kind, name, details, art) values (rid, uid, p_kind, nm, dt, clean);
  return bal - 5000;
end $f$;
revoke all on function public.submit_custom_item(text, text, text, jsonb) from public, anon;
grant execute on function public.submit_custom_item(text, text, text, jsonb) to authenticated;

-- makes the item and puts it in the person's items (used by approve and by grant)
create or replace function public._make_custom_item(p_user uuid, p_kind text, p_name text, p_blurb text, p_art jsonb)
returns text language plpgsql security definer set search_path = public as $f$
declare iid text; sh text := coalesce(p_art->>'shape', 'arrow');
begin
  iid := 'cx_' || substr(md5(gen_random_uuid()::text), 1, 8);
  if p_kind = 'cursor' then iid := iid || '_' || left(regexp_replace(sh, '[^a-z]', '', 'g'), 8); end if;   -- a cursor's shape comes from the last word of its id
  insert into shop_items (id, name, kind, rarity, price, blurb, art, featured, active, sort, for_user)
  values (iid, left(p_name, 40), p_kind, 'legendary', 5000, left(p_blurb, 120), p_art, false, true, 9000, p_user);
  insert into shop_inventory (user_id, item_id) values (p_user, iid);
  return iid;
end $f$;
revoke all on function public._make_custom_item(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.approve_custom_item(p_request uuid, p_name text default null, p_note text default null)
returns text language plpgsql security definer set search_path = public as $f$
declare r shop_requests; iid text;
begin
  if not public.shop_admin() then raise exception 'Only the owner and admins can approve custom items.'; end if;
  select * into r from shop_requests where id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'That order is not waiting any more.'; end if;
  iid := public._make_custom_item(r.user_id, r.kind, coalesce(nullif(btrim(p_name), ''), r.name), 'Custom made just for you.', r.art);
  update shop_requests set status = 'approved', item_id = iid, note = left(coalesce(p_note, ''), 200), decided_at = now() where id = r.id;
  return iid;
end $f$;
revoke all on function public.approve_custom_item(uuid, text, text) from public, anon;
grant execute on function public.approve_custom_item(uuid, text, text) to authenticated;

-- rejecting gives the 5,000 Orbits back by removing the spend row, so the leaderboard never moves
create or replace function public.reject_custom_item(p_request uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $f$
declare r shop_requests;
begin
  if not public.shop_admin() then raise exception 'Only the owner and admins can reject custom items.'; end if;
  select * into r from shop_requests where id = p_request for update;
  if not found or r.status <> 'pending' then raise exception 'That order is not waiting any more.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || r.user_id::text));
  delete from orbit_ledger where user_id = r.user_id and reason = 'spend' and ref = 'custom:' || r.id;
  update shop_requests set status = 'rejected', note = left(coalesce(p_note, ''), 200), decided_at = now() where id = r.id;
end $f$;
revoke all on function public.reject_custom_item(uuid, text) from public, anon;
grant execute on function public.reject_custom_item(uuid, text) to authenticated;

-- by hand, for the owner/admin. Example (shapes are listed in shop-v2.js):
--   select public.grant_custom_item('<user id>', 'font', 'Dragon Ink', '{"shape":"fire","c1":"#ffe14a","c2":"#ff3b14"}');
create or replace function public.grant_custom_item(p_user uuid, p_kind text, p_name text, p_art jsonb, p_blurb text default 'Custom made just for you.')
returns text language plpgsql security definer set search_path = public as $f$
begin
  if not public.shop_admin() then raise exception 'Only the owner and admins can add custom items.'; end if;
  if p_kind not in ('frame','trail','theme','companion','collectible','cursor','font') then raise exception 'Unknown kind.'; end if;
  return public._make_custom_item(p_user, p_kind, p_name, p_blurb, p_art);
end $f$;
revoke all on function public.grant_custom_item(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.grant_custom_item(uuid, text, text, jsonb, text) to authenticated;

-- ───────── 3. the new catalog ─────────
-- old items get their shape (they were all round / ring shaped)
update public.shop_items set art = art || '{"shape":"ring"}'::jsonb where kind in ('frame','trail') and not (art ? 'shape');
update public.shop_items set art = art || '{"shape":"accent"}'::jsonb where kind = 'theme' and not (art ? 'shape');
update public.shop_items set art = art || '{"shape":"float","tile":"circle"}'::jsonb where kind = 'companion' and not (art ? 'shape');
update public.shop_items set art = art || '{"shape":"gem","tile":"circle"}'::jsonb where kind = 'collectible' and not (art ? 'shape');

insert into public.shop_items (id, name, kind, rarity, price, blurb, art, featured, sort) values
  ('fo_pixel', 'Pixel Quest', 'font', 'common', 300, 'Chunky 8-bit letters with a hard arcade shadow.', '{"shape":"pixel","c1":"#7dff6b","c2":"#0b5d1e"}', false, 705),
  ('fo_type', 'Typewriter', 'font', 'common', 260, 'Clack-clack. Ink-stamped letters with a dashed underline.', '{"shape":"type","c1":"#f3e9d2","c2":"#8a7a55"}', false, 710),
  ('fo_chalk', 'Chalkboard', 'font', 'common', 280, 'Hand-written chalk that looks fresh off the board.', '{"shape":"chalk","c1":"#f4f6ff","c2":"#9fb4ff"}', false, 715),
  ('fo_bubble', 'Bubblegum', 'font', 'uncommon', 480, 'Fat, bouncy letters with a candy outline.', '{"shape":"bubble","c1":"#ff8bd0","c2":"#ffffff"}', false, 720),
  ('fo_comic', 'Comic Pop', 'font', 'uncommon', 520, 'POW! Slanted comic letters with a bold outline.', '{"shape":"comic","c1":"#ffe14a","c2":"#e0243a"}', false, 725),
  ('fo_marker', 'Marker Scribble', 'font', 'uncommon', 560, 'Fast felt-tip marker with a scribbled underline.', '{"shape":"marker","c1":"#5be3ff","c2":"#ff4fd8"}', false, 730),
  ('fo_west', 'Wild West', 'font', 'uncommon', 600, 'Saloon-poster slab letters, wanted dead or alive.', '{"shape":"west","c1":"#f0c27a","c2":"#6b3a12"}', false, 735),
  ('fo_script', 'Dream Script', 'font', 'rare', 820, 'Flowing cursive with a slow rainbow glow.', '{"shape":"script","c1":"#ff9bf0","c2":"#7fe3ff"}', false, 740),
  ('fo_neon', 'Neon Sign', 'font', 'rare', 950, 'A glass-tube sign that buzzes and flickers.', '{"shape":"neon","c1":"#37e0ff","c2":"#ff4fd8"}', false, 745),
  ('fo_glitch', 'Glitch', 'font', 'rare', 1100, 'Broken letters that tear and jump on a bad signal.', '{"shape":"glitch","c1":"#00f0ff","c2":"#ff00d4"}', false, 750),
  ('fo_spooky', 'Haunted', 'font', 'rare', 1000, 'Dripping horror letters with a toxic green glow.', '{"shape":"spooky","c1":"#9cff3d","c2":"#2a6b00"}', false, 755),
  ('fo_ice', 'Frostbite', 'font', 'rare', 1050, 'Crystal-cold letters that sparkle with frost.', '{"shape":"ice","c1":"#eaffff","c2":"#57b8ff"}', false, 760),
  ('fo_turbo', 'Turbo', 'font', 'rare', 1150, 'Speed-lined racing letters leaving a motion blur.', '{"shape":"turbo","c1":"#ffe14a","c2":"#ff4d1a"}', false, 765),
  ('fo_retro', 'Retro Wave', 'font', 'epic', 1600, 'Sunset-striped synthwave lettering with a pink halo.', '{"shape":"retro","c1":"#ff4fd8","c2":"#37e0ff"}', false, 770),
  ('fo_matrix', 'Code Rain', 'font', 'epic', 1700, 'Green terminal code with a blinking cursor.', '{"shape":"matrix","c1":"#3dff7a","c2":"#003d14"}', false, 775),
  ('fo_fire', 'Inferno', 'font', 'epic', 1900, 'Burning letters, hot gold melting into red embers.', '{"shape":"fire","c1":"#ffe14a","c2":"#ff3b14"}', false, 780),
  ('fo_holo', 'Hologram', 'font', 'epic', 2100, 'A flickering rainbow projection with scan lines.', '{"shape":"holo","c1":"#37e0ff","c2":"#ff4fd8"}', false, 785),
  ('fo_ghost', 'Whisper', 'font', 'epic', 1800, 'Faint, floating letters that fade in and out.', '{"shape":"ghost","c1":"#e6eeff","c2":"#8f7bff"}', false, 790),
  ('fo_royal', 'Royal Decree', 'font', 'legendary', 3200, 'Engraved gold capitals with a sweeping royal shine.', '{"shape":"royal","c1":"#fff3b0","c2":"#b36a00"}', true, 795),
  ('fo_galaxy', 'Galaxy Ink', 'font', 'legendary', 3900, 'Letters filled with a drifting galaxy and twinkling stars.', '{"shape":"galaxy","c1":"#8f7bff","c2":"#ff4fd8"}', true, 800),
  ('fr_tile', 'Pixel Tile', 'frame', 'common', 280, 'A crisp square frame, like a game tile.', '{"shape":"square","c1":"#7dff6b","c2":"#1ea34a"}', false, 805),
  ('fr_dash', 'Dashed Orbit', 'frame', 'common', 320, 'A dashed ring that slowly spins the other way.', '{"shape":"dash","c1":"#7fe3ff","c2":"#2f6bff"}', false, 810),
  ('fr_cloud', 'Cloud Nine', 'frame', 'common', 340, 'Soft, puffy bumps all around you.', '{"shape":"cloud","c1":"#e6f6ff","c2":"#8fd0ff"}', false, 815),
  ('fr_twin', 'Twin Halo', 'frame', 'uncommon', 480, 'Two thin rings circling each other.', '{"shape":"double","c1":"#c9b8ff","c2":"#7a5cff"}', false, 820),
  ('fr_hive', 'Honeycomb', 'frame', 'uncommon', 560, 'A six-sided honeycomb badge.', '{"shape":"hex","c1":"#ffd34a","c2":"#ff9f1a"}', false, 825),
  ('fr_petalring', 'Blossom', 'frame', 'uncommon', 640, 'Eight pointed petals in full bloom.', '{"shape":"petal","c1":"#ffc2e4","c2":"#ff4fa6"}', false, 830),
  ('fr_gem', 'Gem Cut', 'frame', 'rare', 950, 'An eight-sided cut stone.', '{"shape":"octagon","c1":"#7fffe0","c2":"#0aa38a"}', false, 835),
  ('fr_gear', 'Clockwork', 'frame', 'rare', 990, 'Turning gear teeth, brass and copper.', '{"shape":"gear","c1":"#ffcf8a","c2":"#b5651d"}', false, 840),
  ('fr_diamond', 'Diamond Edge', 'frame', 'rare', 1060, 'A sharp diamond silhouette that pulses.', '{"shape":"diamond","c1":"#ffffff","c2":"#57b8ff"}', false, 845),
  ('fr_sun', 'Sunburst', 'frame', 'epic', 1700, 'Rays of light bursting outward.', '{"shape":"burst","c1":"#fff27a","c2":"#ff7a1a"}', false, 850),
  ('fr_thorn', 'Thorn Wreath', 'frame', 'epic', 1650, 'A ring of sharp thorns.', '{"shape":"thorn","c1":"#7dff9c","c2":"#b0123a"}', false, 855),
  ('fr_star', 'Shooting Star', 'frame', 'epic', 1850, 'A ten-point star with a trailing shine.', '{"shape":"star","c1":"#fff7a8","c2":"#ff4fd8"}', false, 860),
  ('fr_saturn', 'Saturn Band', 'frame', 'epic', 1950, 'A thin ring with a little moon in orbit.', '{"shape":"orbit","c1":"#c9b8ff","c2":"#37c8ff"}', false, 865),
  ('fr_crown', 'Royal Crown', 'frame', 'legendary', 3100, 'A golden crown that sits on your avatar.', '{"shape":"crown","c1":"#fff3b0","c2":"#b36a00"}', true, 870),
  ('tr_bubble', 'Bubble Pop', 'trail', 'common', 260, 'Little bubbles float up from every click.', '{"shape":"bubbles","c1":"#9be8ff","c2":"#ffffff"}', false, 905),
  ('tr_pixel', '8-Bit Burst', 'trail', 'common', 300, 'Crisp square pixels scatter on click.', '{"shape":"pixels","c1":"#7dff6b","c2":"#fff27a"}', false, 910),
  ('tr_sparkle', 'Glitter Pop', 'trail', 'uncommon', 420, 'A pop of four-point glitter.', '{"shape":"sparkle","c1":"#fff7a8","c2":"#ff9bf0"}', false, 915),
  ('tr_heart', 'Heartbeat', 'trail', 'uncommon', 480, 'Tiny hearts float away from your click.', '{"shape":"hearts","c1":"#ff6b8b","c2":"#ffd1dc"}', false, 920),
  ('tr_snow', 'Snowfall', 'trail', 'uncommon', 500, 'Snowflakes drift down where you click.', '{"shape":"snow","c1":"#ffffff","c2":"#9be8ff"}', false, 925),
  ('tr_note', 'Melody', 'trail', 'rare', 700, 'Music notes dance out of every click.', '{"shape":"notes","c1":"#c9b8ff","c2":"#37e0ff"}', false, 930),
  ('tr_petal', 'Cherry Blossom', 'trail', 'rare', 780, 'Pink petals spin and fall.', '{"shape":"petals","c1":"#ffc2e4","c2":"#ff7ab8"}', false, 935),
  ('tr_star', 'Shooting Stars', 'trail', 'rare', 850, 'Stars shoot out and fade.', '{"shape":"stars","c1":"#fff27a","c2":"#ff9f43"}', false, 940),
  ('tr_confetti', 'Party Popper', 'trail', 'rare', 900, 'Colourful confetti rains down.', '{"shape":"confetti","c1":"#ff4fd8","c2":"#37e0ff"}', false, 945),
  ('tr_bolt', 'Lightning Strike', 'trail', 'epic', 1500, 'A crackling bolt snaps out of your click.', '{"shape":"bolts","c1":"#ffe14a","c2":"#8f7bff"}', false, 950),
  ('tr_burst', 'Firework', 'trail', 'epic', 1600, 'A firework bursts at every click.', '{"shape":"burst","c1":"#ff6bd6","c2":"#ffd166"}', false, 955),
  ('tr_galaxy', 'Mini Galaxy', 'trail', 'epic', 1900, 'A tiny spiral galaxy spins out and fades.', '{"shape":"galaxy","c1":"#a28bff","c2":"#37e0ff"}', true, 960),
  ('th_minimal', 'Paper Minimal', 'theme', 'common', 350, 'Flat, thin lines and no shadows. Clean and quiet.', '{"shape":"minimal","c1":"#8aa4ff","c2":"#cfe0ff"}', false, 1005),
  ('th_bubblegum', 'Bubble Pop', 'theme', 'uncommon', 600, 'Everything gets round, soft and playful.', '{"shape":"bubble","c1":"#ff6bb8","c2":"#ffb3de"}', false, 1010),
  ('th_blueprint', 'Blueprint', 'theme', 'rare', 1000, 'A drafting-table grid with sharp technical corners.', '{"shape":"blueprint","c1":"#4aa8ff","c2":"#9be0ff"}', false, 1015),
  ('th_sketch', 'Notebook Doodle', 'theme', 'rare', 950, 'Hand-drawn dashed borders and a handwritten font.', '{"shape":"sketch","c1":"#ffd34a","c2":"#fff0a8"}', false, 1020),
  ('th_glass', 'Frosted Glass', 'theme', 'rare', 900, 'See-through, blurred glass panels.', '{"shape":"glass","c1":"#6ad4ff","c2":"#b8f0ff"}', false, 1025),
  ('th_neonsign', 'Neon Outline', 'theme', 'epic', 1500, 'Glowing outlines on a dark, sharp-edged Orbit.', '{"shape":"neon","c1":"#ff2fd0","c2":"#37e0ff"}', false, 1030),
  ('th_pixelui', 'Pixel Arcade', 'theme', 'epic', 1700, 'Blocky corners, chunky borders and a retro font.', '{"shape":"pixel","c1":"#7dff6b","c2":"#fff27a"}', false, 1035),
  ('th_terminal', 'Hacker Terminal', 'theme', 'epic', 1800, 'Black screen, green text, square corners, scan lines.', '{"shape":"terminal","c1":"#3dff7a","c2":"#a8ffc4"}', false, 1040),
  ('th_livingaurora', 'Living Aurora', 'theme', 'legendary', 3200, 'The whole background slowly flows like northern lights.', '{"shape":"aurora","c1":"#3dffa0","c2":"#d86bff"}', true, 1045),
  ('co_bee', 'Buzzy Bee', 'companion', 'common', 300, 'Zig-zags around your name.', '{"glyph":"🐝","shape":"zig","tile":"circle","c1":"#ffd34a","c2":"#ff9f1a"}', false, 1105),
  ('co_mooncat', 'Moon Cat', 'companion', 'uncommon', 500, 'Hops happily beside you.', '{"glyph":"🐱","shape":"bounce","tile":"squircle","c1":"#c9b8ff","c2":"#7a5cff"}', false, 1110),
  ('co_emberfox', 'Ember Fox', 'companion', 'uncommon', 640, 'Swishes its tail while you chat.', '{"glyph":"🦊","shape":"sway","tile":"drop","c1":"#ff9f43","c2":"#ff4d1a"}', false, 1115),
  ('co_pocketghost', 'Pocket Ghost', 'companion', 'rare', 800, 'Floats up and down, half see-through.', '{"glyph":"👻","shape":"float","tile":"blob","c1":"#dfe6ff","c2":"#8f7bff"}', false, 1120),
  ('co_boltbot', 'Bolt Bot', 'companion', 'rare', 900, 'Wobbles and beeps in a square body.', '{"glyph":"🤖","shape":"wiggle","tile":"square","c1":"#9be8ff","c2":"#2f6bff"}', false, 1125),
  ('co_miniufo', 'Mini UFO', 'companion', 'rare', 1100, 'Hovers and sweeps a tiny beam.', '{"glyph":"🛸","shape":"hover","tile":"saucer","c1":"#7fffe0","c2":"#3a2fff"}', false, 1130),
  ('co_jelly', 'Star Jelly', 'companion', 'epic', 1500, 'Pulses softly like a deep-sea jelly.', '{"glyph":"🪼","shape":"pulse","tile":"dome","c1":"#ff9bf0","c2":"#7a5cff"}', false, 1135),
  ('co_comet', 'Orbit Comet', 'companion', 'epic', 1800, 'Circles around your name in a tiny orbit.', '{"glyph":"☄️","shape":"orbit","tile":"circle","c1":"#ffb347","c2":"#ff4fd8"}', false, 1140),
  ('co_phoenixchick', 'Phoenix Chick', 'companion', 'epic', 2000, 'Flaps its wings in a ring of fire.', '{"glyph":"🦅","shape":"flap","tile":"hex","c1":"#ffd166","c2":"#ff3b14"}', false, 1145),
  ('co_stormdrake', 'Storm Dragon', 'companion', 'legendary', 3300, 'Breathes slowly with a glowing aura.', '{"glyph":"🐉","shape":"breathe","tile":"shield","c1":"#7dff9c","c2":"#0aa38a"}', true, 1150),
  ('cl_cube', 'Mystery Cube', 'collectible', 'common', 350, 'A tumbling cube of surprises.', '{"glyph":"🎲","shape":"cube","tile":"circle","c1":"#9be8ff","c2":"#2f6bff"}', false, 1205),
  ('cl_coin', 'Orbit Coin', 'collectible', 'uncommon', 550, 'A coin that never stops flipping.', '{"glyph":"🪙","shape":"coin","tile":"circle","c1":"#ffd34a","c2":"#b36a00"}', false, 1210),
  ('cl_stardust', 'Stardust Potion', 'collectible', 'uncommon', 620, 'A bubbling bottle of starlight.', '{"glyph":"🧪","shape":"bottle","tile":"circle","c1":"#9bffd0","c2":"#7a5cff"}', false, 1215),
  ('cl_lantern', 'Sky Lantern', 'collectible', 'uncommon', 480, 'A lantern that drifts and glows.', '{"glyph":"🏮","shape":"lantern","tile":"circle","c1":"#ffb347","c2":"#ff4d1a"}', false, 1220),
  ('cl_book', 'Star Atlas', 'collectible', 'rare', 850, 'An open book of constellations.', '{"glyph":"📖","shape":"book","tile":"circle","c1":"#c9b8ff","c2":"#37e0ff"}', false, 1225),
  ('cl_ticket', 'Golden Ticket', 'collectible', 'rare', 900, 'One entry to everything, tilted just so.', '{"glyph":"🎟️","shape":"ticket","tile":"circle","c1":"#ffd34a","c2":"#ff7a1a"}', false, 1230),
  ('cl_champ', 'Champion Medal', 'collectible', 'rare', 1000, 'A medal hanging from a ribbon.', '{"glyph":"🥇","shape":"medal","tile":"circle","c1":"#ffd34a","c2":"#e0243a"}', false, 1235),
  ('cl_globe', 'Snow Globe', 'collectible', 'rare', 1100, 'A tiny world under glass with falling snow.', '{"glyph":"⛄","shape":"globe","tile":"circle","c1":"#cfeaff","c2":"#57b8ff"}', false, 1240),
  ('cl_shield', 'Guardian Crest', 'collectible', 'epic', 1600, 'A shield crest with a shining edge.', '{"glyph":"🛡️","shape":"crest","tile":"circle","c1":"#9be8ff","c2":"#7a5cff"}', false, 1245),
  ('cl_card', 'Holo Card', 'collectible', 'epic', 1800, 'A trading card with a rainbow foil shine.', '{"glyph":"🃏","shape":"card","tile":"circle","c1":"#ff4fd8","c2":"#37e0ff"}', false, 1250),
  ('cl_throne', 'Crown Pedestal', 'collectible', 'legendary', 4200, 'A crown resting on a glowing pedestal.', '{"glyph":"👑","shape":"pedestal","tile":"circle","c1":"#fff3b0","c2":"#b36a00"}', true, 1255),
  ('cu_mint_paw', 'Mint Paw', 'cursor', 'common', 190, 'A little paw print for clicking.', '{"shape":"paw","c1":"#c8ffe6","c2":"#12a36b"}', false, 1305),
  ('cu_sky_cloud', 'Daydream Cloud', 'cursor', 'common', 230, 'A fluffy cloud, soft and light.', '{"shape":"cloud","c1":"#ffffff","c2":"#8fd0ff"}', false, 1310),
  ('cu_neon_ghost', 'Neon Ghost', 'cursor', 'uncommon', 540, 'A glowing ghost that follows you around.', '{"shape":"ghost","c1":"#d6ff7a","c2":"#00a844"}', false, 1315),
  ('cu_steel_sword', 'Steel Sword', 'cursor', 'rare', 980, 'A knight''s sword with a bright edge.', '{"shape":"sword","c1":"#ffffff","c2":"#6b7694"}', false, 1320),
  ('cu_plum_paw', 'Plum Paw', 'cursor', 'rare', 1020, 'A royal-purple paw print.', '{"shape":"paw","c1":"#e0b8ff","c2":"#7a1fd6"}', false, 1325),
  ('cu_royal_crown', 'Royal Crown', 'cursor', 'legendary', 4600, 'Fit for the king of Orbit.', '{"shape":"crown","c1":"#fff3b0","c2":"#b36a00"}', false, 1330)
on conflict (id) do nothing;
