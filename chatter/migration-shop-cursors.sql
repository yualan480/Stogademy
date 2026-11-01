-- Orbit Shop: custom cursors (39 designs, from 120 to 6400 Orbits, Common to Legendary).
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER migration-orbit-shop.sql. The cursors are drawn by the app (shop-cursors.js); the database only stores the price,
-- the rarity and who owns what, exactly like every other shop item.

-- allow the new kind
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('frame','trail','theme','companion','collectible','cursor'));

insert into public.shop_items (id, name, kind, rarity, price, blurb, art, featured, sort) values
  ('cu_sunset_pixel', 'Pixel Sunset', 'cursor', 'common', 160, 'Chunky retro cursor, fiery red fading to calm blue.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 300),
  ('cu_sunset_heart', 'Twilight Heart', 'cursor', 'common', 240, 'A warm heart cooling into an evening blue.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 310),
  ('cu_sunset_arrow', 'Sunset Arrow', 'cursor', 'uncommon', 480, 'Fiery red melting into a mellow blue dusk.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 320),
  ('cu_sunset_plane', 'Sunset Glider', 'cursor', 'uncommon', 560, 'Paper-plane cursor gliding from blue sky to red horizon.', '{"c1":"#8cc4f4","c2":"#ff2a14","glyph":""}', false, 330),
  ('cu_sunset_moon', 'Dusk Crescent', 'cursor', 'uncommon', 690, 'A crescent caught between sundown and moonrise.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 340),
  ('cu_sunset_leaf', 'Embers Leaf', 'cursor', 'rare', 820, 'A leaf glowing red at the tip and cool blue at the stem.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 350),
  ('cu_sunset_flame', 'Horizon Flame', 'cursor', 'rare', 1080, 'A flame that cools from fire red to soft blue.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 360),
  ('cu_sunset_comet', 'Sunset Comet', 'cursor', 'rare', 1260, 'A blazing red head with a mellow blue tail.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', true, 370),
  ('cu_sunset_rocket', 'Sunset Rocket', 'cursor', 'epic', 1740, 'Launches from a red-hot horizon into a calm blue sky.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 380),
  ('cu_sunset_bolt', 'Afterglow Bolt', 'cursor', 'epic', 2150, 'Lightning at dusk, blue storm cloud to red afterglow.', '{"c1":"#8cc4f4","c2":"#ff2a14","glyph":""}', false, 390),
  ('cu_sunset_orb', 'Horizon Sun', 'cursor', 'epic', 2480, 'A setting sun with its reflection on a blue sea.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', true, 400),
  ('cu_sunset_wand', 'Dusk Wand', 'cursor', 'legendary', 3900, 'Wave it and the sky turns from red to blue.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 410),
  ('cu_sunset_star', 'Evening Star', 'cursor', 'legendary', 5200, 'The sun going down and the first star coming out.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', true, 420),
  ('cu_sunset_gem', 'Sunset Opal', 'cursor', 'legendary', 6400, 'A rare opal holding a whole sunset inside.', '{"c1":"#ff2a14","c2":"#8cc4f4","glyph":""}', false, 430),
  ('cu_chrome_arrow', 'Chrome Arrow', 'cursor', 'common', 120, 'Clean brushed-metal pointer.', '{"c1":"#ffffff","c2":"#6b7694","glyph":""}', false, 440),
  ('cu_neon_pixel', 'Neon Pixel', 'cursor', 'common', 175, 'Glowing green arcade pixels.', '{"c1":"#d6ff7a","c2":"#00a844","glyph":""}', false, 450),
  ('cu_mint_leaf', 'Mint Leaf', 'cursor', 'common', 210, 'Fresh and light, like a spring morning.', '{"c1":"#c8ffe6","c2":"#12a36b","glyph":""}', false, 460),
  ('cu_tide_arrow', 'Tidepool Arrow', 'cursor', 'common', 260, 'Shallow turquoise deepening to ocean blue.', '{"c1":"#7fe3e0","c2":"#0b4fb8","glyph":""}', false, 470),
  ('cu_rose_heart', 'Rose Heart', 'cursor', 'uncommon', 360, 'Soft pink with a deep rose edge.', '{"c1":"#ffe0ef","c2":"#e0408c","glyph":""}', false, 480),
  ('cu_candy_bubble', 'Candy Bubble', 'cursor', 'uncommon', 395, 'A shiny pink and sky-blue soap bubble.', '{"c1":"#ff8bd0","c2":"#8be3ff","glyph":""}', false, 490),
  ('cu_ember_arrow', 'Ember Arrow', 'cursor', 'uncommon', 430, 'Yellow-hot tip cooling to a dark red glow.', '{"c1":"#fff27a","c2":"#9b1030","glyph":""}', false, 500),
  ('cu_mint_comet', 'Mint Comet', 'cursor', 'uncommon', 520, 'A cool green comet streaking past.', '{"c1":"#c8ffe6","c2":"#12a36b","glyph":""}', false, 510),
  ('cu_frost_moon', 'Frost Moon', 'cursor', 'uncommon', 570, 'An icy crescent for quiet winter nights.', '{"c1":"#ffffff","c2":"#57b8ff","glyph":""}', false, 520),
  ('cu_ringed_planet', 'Ringed Planet', 'cursor', 'uncommon', 650, 'A little violet planet with its own ring.', '{"c1":"#b79bff","c2":"#37c8ff","glyph":""}', false, 530),
  ('cu_frost_flake', 'Frost Flake', 'cursor', 'rare', 760, 'A crisp snowflake that sparkles when you hover.', '{"c1":"#ffffff","c2":"#57b8ff","glyph":""}', false, 540),
  ('cu_rose_plane', 'Rose Glider', 'cursor', 'rare', 880, 'A pink paper plane, folded with care.', '{"c1":"#ffe0ef","c2":"#e0408c","glyph":""}', false, 550),
  ('cu_aurora_arrow', 'Aurora Arrow', 'cursor', 'rare', 940, 'Northern-lights green fading into violet.', '{"c1":"#3dffa0","c2":"#d86bff","glyph":""}', false, 560),
  ('cu_void_cross', 'Void Crosshair', 'cursor', 'rare', 1050, 'A precise purple reticle from deep space.', '{"c1":"#9c8cff","c2":"#160a42","glyph":""}', false, 570),
  ('cu_cyber_bolt', 'Cyber Bolt', 'cursor', 'rare', 1120, 'Electric cyan to hot magenta.', '{"c1":"#00f0ff","c2":"#ff00d4","glyph":""}', false, 580),
  ('cu_nebula_star', 'Nebula Star', 'cursor', 'rare', 1290, 'A star born in a magenta and indigo cloud.', '{"c1":"#ff4fd8","c2":"#3a2fff","glyph":""}', false, 590),
  ('cu_ocean_comet', 'Deep Sea Comet', 'cursor', 'epic', 1680, 'A comet that fell into the ocean and kept glowing.', '{"c1":"#7fe3e0","c2":"#0b4fb8","glyph":""}', false, 600),
  ('cu_nebula_rocket', 'Nebula Rocket', 'cursor', 'epic', 1950, 'Pink and violet exhaust across the galaxy.', '{"c1":"#ff4fd8","c2":"#3a2fff","glyph":""}', false, 610),
  ('cu_lava_flame', 'Lava Flame', 'cursor', 'epic', 2050, 'Molten yellow, orange and crimson.', '{"c1":"#fff27a","c2":"#9b1030","glyph":""}', false, 620),
  ('cu_void_hole', 'Black Hole', 'cursor', 'epic', 2330, 'A dark core with a glowing violet ring.', '{"c1":"#9c8cff","c2":"#160a42","glyph":""}', false, 630),
  ('cu_solar_spark', 'Solar Flare', 'cursor', 'epic', 2620, 'A burst of sun that shines on everything.', '{"c1":"#fff7a8","c2":"#ff4d1a","glyph":""}', false, 640),
  ('cu_gold_arrow', 'Golden Arrow', 'cursor', 'legendary', 3450, 'Polished gold with a bright shine.', '{"c1":"#fff3b0","c2":"#b36a00","glyph":""}', false, 650),
  ('cu_aurora_wand', 'Aurora Wand', 'cursor', 'legendary', 4150, 'Paints the northern lights wherever you point.', '{"c1":"#3dffa0","c2":"#d86bff","glyph":""}', true, 660),
  ('cu_prism_star', 'Prism Star', 'cursor', 'legendary', 4900, 'Every colour of the rainbow in one star.', '{"c1":"#ff3b3b","c2":"#8f3bff","glyph":""}', false, 670),
  ('cu_gold_gem', 'Crown Jewel', 'cursor', 'legendary', 6000, 'The most precious cursor in Orbit.', '{"c1":"#fff3b0","c2":"#b36a00","glyph":""}', false, 680)
on conflict (id) do nothing;
