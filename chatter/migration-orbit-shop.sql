-- Orbit Shop: spend Orbits on cosmetics.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-orbits-unified.sql (it uses the same Orbits ledger and the same balance).
--
--  shop_items      the catalog. Prices live HERE, so a browser can never choose its own price.
--  shop_inventory  what each person owns and has equipped. Everyone can read it (so frames show on avatars). Nobody can write it directly.
--  buy_shop_item   takes the Orbits and adds the item in one step. Spending never lowers leaderboard rank.
--  equip_shop_item puts an item on or takes it off. One equipped item per kind.

-- ───────── 1. tables ─────────
create table if not exists public.shop_items (
  id       text primary key check (id ~ '^[a-z0-9_]{1,24}$'),
  name     text not null check (char_length(name) between 1 and 40),
  kind     text not null check (kind in ('frame','trail','theme','companion','collectible')),
  rarity   text not null default 'common' check (rarity in ('common','uncommon','rare','epic','legendary')),
  price    int  not null check (price between 1 and 100000),
  blurb    text not null default '' check (char_length(blurb) <= 120),
  art      jsonb not null default '{}'::jsonb,   -- how it looks: {"c1":"#hex","c2":"#hex","glyph":"emoji"}
  featured boolean not null default false,
  active   boolean not null default true,
  sort     int not null default 100,
  created_at timestamptz not null default now()
);
create table if not exists public.shop_inventory (
  user_id  uuid not null references auth.users(id) on delete cascade,
  item_id  text not null references public.shop_items(id) on delete cascade,
  equipped boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists shop_inventory_item on public.shop_inventory (item_id);

alter table public.shop_items enable row level security;
alter table public.shop_inventory enable row level security;
drop policy if exists si_read on public.shop_items;
create policy si_read on public.shop_items for select to authenticated using (active or public.orbit_staff());
drop policy if exists sinv_read on public.shop_inventory;
create policy sinv_read on public.shop_inventory for select to authenticated using (true);
revoke insert, update, delete on public.shop_items, public.shop_inventory from anon, authenticated;

-- ───────── 2. buy ─────────
create or replace function public.buy_shop_item(p_item text)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it shop_items; bal bigint;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into it from shop_items where id = p_item and active;
  if not found then raise exception 'That item is not for sale.'; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));   -- same lock spend_orbits uses, so two buys can never overspend
  if exists (select 1 from shop_inventory where user_id = uid and item_id = it.id) then raise exception 'You already own this.'; end if;
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < it.price then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -it.price, 'spend', 'shop_' || it.id || ':' || gen_random_uuid());
  insert into shop_inventory (user_id, item_id) values (uid, it.id);
  return bal - it.price;
end $$;
revoke all on function public.buy_shop_item(text) from public, anon;
grant execute on function public.buy_shop_item(text) to authenticated;

-- ───────── 3. equip / unequip ─────────
create or replace function public.equip_shop_item(p_item text, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); k text;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select i.kind into k from shop_inventory v join shop_items i on i.id = v.item_id where v.user_id = uid and v.item_id = p_item;
  if k is null then raise exception 'You do not own this.'; end if;
  if p_on then
    update shop_inventory v set equipped = false from shop_items i where v.item_id = i.id and v.user_id = uid and i.kind = k and v.item_id <> p_item;
  end if;
  update shop_inventory set equipped = coalesce(p_on, false) where user_id = uid and item_id = p_item;
end $$;
revoke all on function public.equip_shop_item(text, boolean) from public, anon;
grant execute on function public.equip_shop_item(text, boolean) to authenticated;

-- ───────── 4. the starting catalog (edit prices or add rows any time; staff can use the Table editor) ─────────
insert into public.shop_items (id, name, kind, rarity, price, blurb, art, featured, sort) values
  ('fr_comet',    'Comet Ring',       'frame',      'legendary', 2500, 'A blazing tail circles your avatar.',        '{"c1":"#ffb347","c2":"#ff4fd8"}', true, 10),
  ('fr_aurora',   'Aurora Ring',      'frame',      'epic',      1800, 'Shifting northern lights around you.',       '{"c1":"#37e0ff","c2":"#7a5cff"}', true, 20),
  ('fr_neon',     'Neon Ring',        'frame',      'rare',       900, 'A crisp electric blue outline.',             '{"c1":"#2f6bff","c2":"#37e0ff"}', false, 30),
  ('fr_mint',     'Mint Ring',        'frame',      'uncommon',   400, 'Cool green, easy on the eyes.',              '{"c1":"#3ecf8e","c2":"#9bffd0"}', false, 40),
  ('tr_stardust', 'Stardust Trail',   'trail',      'epic',      1500, 'Your clicks burst into violet stardust.',    '{"c1":"#a28bff","c2":"#ff9bf0"}', true, 50),
  ('tr_ember',    'Ember Trail',      'trail',      'rare',       800, 'Warm orange sparks on every click.',         '{"c1":"#ff9f43","c2":"#ff4d6d"}', false, 60),
  ('tr_ice',      'Ice Trail',        'trail',      'uncommon',   350, 'Frosty cyan ripples.',                       '{"c1":"#9be8ff","c2":"#37e0ff"}', false, 70),
  ('th_nebula',   'Nebula Theme',     'theme',      'epic',      1600, 'Your Orbit glows magenta and violet.',       '{"c1":"#c04cff","c2":"#ff7ad9"}', false, 80),
  ('th_emerald',  'Emerald Theme',    'theme',      'rare',       700, 'A calm green accent across Orbit.',          '{"c1":"#19b36b","c2":"#5be3a5"}', false, 90),
  ('th_sunset',   'Sunset Theme',     'theme',      'uncommon',   450, 'Warm orange accent across Orbit.',           '{"c1":"#f2711c","c2":"#ffb36b"}', false, 100),
  ('co_moon',     'Mini Moon',        'companion',  'rare',      1200, 'Always by your name.',                       '{"glyph":"🌙","c1":"#8fa6e8","c2":"#37e0ff"}', true, 110),
  ('co_alien',    'Pocket Alien',     'companion',  'epic',      1700, 'A tiny friend who never leaves.',            '{"glyph":"👽","c1":"#3ecf8e","c2":"#9bffd0"}', false, 120),
  ('co_rocket',   'Little Rocket',    'companion',  'uncommon',   600, 'Ready for launch.',                          '{"glyph":"🚀","c1":"#ff6b8b","c2":"#ffd166"}', false, 130),
  ('cl_crystal',  'Star Crystal',     'collectible','uncommon',   650, 'A glowing keepsake for your collection.',    '{"glyph":"💎","c1":"#37e0ff","c2":"#7a5cff"}', false, 140),
  ('cl_trophy',   'Golden Orbit',     'collectible','legendary', 3000, 'The rarest keepsake in Orbit.',              '{"glyph":"🏆","c1":"#ffd166","c2":"#ff9f43"}', false, 150)
on conflict (id) do nothing;
