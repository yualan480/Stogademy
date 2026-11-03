# Orbitcraft

Orbitcraft adds a real multiplayer voxel sandbox to the supplied Stogademy site.
It appears immediately below Orbit Casino inside Orbit Fun, and in the Orbit
Games catalog. No other game scripts, casino code, shop code, or database tables
were changed.

## What you receive

- One public 1,024 × 1,024 × 56 block world, shared by everyone on this deployment.
- Original pixel textures, first-person 3D blocks, trees and forests, desert,
  meadow, alpine mountains, water and underground caves.
- Server-controlled movement, collision, jumping, swimming, timed mining and building.
- Progressive block cracks and persistent dropped items that float and rotate.
- Other connected players with Orbit usernames above their block avatars.
- 36 inventory slots, nine hotbar slots included, an off-hand slot, and chests.
- Public multiplayer chat with recent history saved.
- Keyboard/mouse and touch controls.
- Cloudflare Worker + SQLite Durable Object backend, and a Node.js local server.

The online count contains real connected players only. Animals and monsters are server-controlled NPCs. Local development identities
represent real connections from the browsers you open; production requires a
verified Orbit/Supabase session.

## Deploy on your existing Cloudflare site

A static upload alone cannot run the multiplayer server. This package includes
the Cloudflare Worker needed for your existing `study.stogademy.workers.dev`
address. Its name in `wrangler.jsonc` is `study`.

On your computer:

1. Install Node.js **24 or newer** from https://nodejs.org/ .
2. Extract the complete ZIP. Keep `chatter`, `games`, and `orbitcraft` alongside
   the other site files. Do not extract only the orbitcraft folder.
3. Open a terminal in the extracted **orbitcraft** folder.
4. Run:

   ```sh
   npm ci
   npx wrangler login
   npm run deploy:cloudflare
   ```

5. Select the Cloudflare account that owns your current `study` Worker when
   Wrangler asks. The login opens Cloudflare in your browser; no API keys go
   into chat or into your site files.
6. Open your site, sign in to Orbit normally, then open **Orbit Fun → Orbitcraft**.
   Ask another person signed in to a different Orbit account to join the same
   site. You should see each other, exchange chat messages, and see each
   other’s block edits immediately.

The deploy command rebuilds the full static site, includes the Three.js browser
modules, uploads the Worker, binds `ORBITCRAFT_WORLD`, and applies the initial
SQLite Durable Object migration. Your existing Supabase project remains the
account backend. No Supabase SQL migration, service-role key, or new user table
is required for Orbitcraft.

This configuration assumes your current Worker serves the static files supplied
in the original ZIP. If it also has custom Worker request handlers or additional
bindings that were not in that ZIP, merge the handlers/bindings into this Worker
before replacing that deployment. This package cannot preserve code it was not
provided.

For Git-connected Cloudflare Workers Builds, commit the **whole extracted site**
to your repository, set the project root to `orbitcraft`, build command to
`npm ci && npm run build:cloudflare`, and deploy command to `npx wrangler deploy`.
Use the same Worker/account. After the first migration, preserve the binding and
migration history on subsequent updates. Do not delete/recreate the Durable
Object binding or change the public-world instance name to reset a problem.

## Visual style

The world uses original pixel textures for grass, soil, rock, sand, bark, log
ends, planks, snow and cutout leaves, plus block-corner shading, daylight sky,
block clouds and underwater haze. A first-person hand holds the selected
resource and swings during interaction. Textured hotbar icons and Orbit’s navy,
blue and orbital branding tie the game’s menus and overlays to the main site.
Player models have original pixel faces, hair, clothing and shoulder/hip-based
walk animations. Grass tufts and small flowers add surface detail without
changing terrain or adding items. Hotbar blocks use isometric texture previews,
and the inventory shows the actual log-to-plank recipe next to its craft action.
These are presentation changes: existing terrain, inventories, structures,
world-generation version and multiplayer authority are preserved.

## Mining and dropped resources

Hold the left mouse button (or hold the mobile **Hold to mine** button) while
looking at a block. Cracks spread as the server's mining timer advances. Leaves
take 0.35 seconds, dirt 0.65 seconds, logs 1.8 seconds and stone 2.6 seconds by hand; appropriate tools speed mining and a pickaxe is required for stone/ore drops;
bedrock cannot be mined. Releasing, looking away, opening a menu or losing fresh
input cancels that block's progress. Other connected players see the cracks too.

A broken block creates a small textured item that falls to the ground, bobs and
rotates slowly. It is not immediately added to inventory. After a 0.75-second
pickup delay, walking within about 1.35 blocks horizontally collects it when
there is space. The server decides pickup and allows exactly one collector.
Full inventories leave items on the ground. Drops persist when players leave
and across server restarts, with no automatic despawn timer. A cap of 2,048
uncollected items pauses further mining until players collect some of them.

Block removal, drop creation and mining statistics commit together. Pickup
atomically removes the drop and saves the collector's inventory. Falling item
positions are saved periodically and when the last player leaves. The new
SQLite table is additive: existing world terrain, builds, inventories and the
world-generation version stay intact. Reload the game after deploying both
the client and server update so the hold-to-mine controls match the server.

## How the backend works

The browser connects to same-origin `/orbitcraft/socket` using WebSockets. One
Durable Object, named `orbitcraft-public-v1`, owns the entire public world. Its
SQLite database stores block deltas, player inventories, positions, statistics,
dropped items and recent chat. The world terrain is deterministic; buildings and mined blocks
are persisted as edits. No activity is required for the saves to remain stored.

Supabase `/auth/v1/user` verifies the login token on the server. The server then
loads the profile username using the verified user ID and the user’s existing
Supabase permissions. It ignores client-supplied names, inventories, coordinates,
and block targets. Mining uses a server-side line-of-sight ray; placement checks
resources, reach, and other players. Block edits and inventories commit together.
The only Supabase key used is the existing public anon key in `chatter/config.js`.
Never put a service-role key in browser files.

Block/inventory edits save immediately. Movement saves every two seconds and on
normal disconnect; an abrupt host failure may lose up to two seconds of movement,
while committed block edits and resource changes remain saved. Recent chat is
capped at 200 messages, of which the latest 30 load when joining. Sessions require
reconnection after at most 45 minutes; reconnect refreshes the Orbit session when
needed. Only one connection per Orbit account is permitted.

The current capacity is 48 simultaneous connections, one finite public world,
PvP enabled and no fluids simulation. Animals and hostile mobs are server-controlled. Water supports swimming. Snow, logs,
leaves, sand, dirt, grass, stone and oak planks can be collected/placed; bedrock
cannot be mined. There is no private-land protection yet: public players can
edit shared builds. This is a playable first version, not a complete Minecraft
clone. Cloudflare Workers/Durable Objects usage is metered under your account’s
plan, and a live world keeps its object active while players are connected.

## Local development

```sh
cd orbitcraft
npm ci
ORBITCRAFT_DEV=1 npm start
```

On Windows PowerShell:

```powershell
$env:ORBITCRAFT_DEV="1"
npm start
```

Open the local server’s `/orbitcraft/` page on port 8787. Use different names in
two browser windows to test real multiplayer without requiring live Orbit login.
The site is served from the parent directory, so existing pages work too. Guest
mode can bind only to localhost and is never enabled in the Cloudflare Worker.
With `ORBITCRAFT_DEV` omitted, the Node server requires real Orbit authentication.

Node saves are in `orbitcraft/data/world.sqlite`, separate from Cloudflare saves.
`ORBITCRAFT_DB`, `PORT`, and `HOST` customize the Node process. In Node production,
put this server behind HTTPS, preserve the same origin and WebSocket upgrade,
and keep the database on persistent storage. Running multiple independent Node
processes against different databases creates different worlds; use the single
Cloudflare Durable Object deployment for the hosted public world.

Cloudflare runtime locally, using real Orbit accounts:

```sh
npm run dev:cloudflare
```

## Validation

```sh
npm test
node test/cloudflare.check.js
```

The Node tests cover world features, collisions, mining, building, resource
accounting, identity/placement checks, real WebSocket synchronization, and saved
state after restart. The Cloudflare check runs actual workerd WebSockets and
SQLite, including a Durable Object restart. That check stubs **only Supabase
identity responses**, so it needs no private test account. It does not establish
that a live user's Supabase permissions or the deployed site have been tested.

`node test/browser.check.js` exercises two real Chromium browser connections,
movement, mining cracks, rotating drops, proximity pickup, shared placement,
chat, crafting, reconnect saves, and mobile controls.
`node test/mining-mobile.check.js` also exercises actual touch hold/release and
the mobile join screen. These checks expect the local development server on port 8787 and Chromium at
`CHROMIUM_PATH` (or `/usr/bin/chromium`). Screenshots go to `ARTIFACT_DIR` (or
`/workspace/artifacts`). On other systems set those paths before running it.

No live deployment has been performed by creating this package. Publishing
requires signing into your Cloudflare account using the steps above.


## Browser survival

This is Orbitcraft's custom browser survival game, not the official Minecraft
Java software. Existing builds and edits remain intact. Natural, unedited stone
now includes underground coal, iron, gold, diamond and ancient debris resources.

- Hand crafting offers planks, sticks and tables. Place a table and right-click
  it for the 3×3 crafting grid. Recipes validate ingredient arrangement and consume them on
  the server. Wooden, stone, iron, gold, diamond and netherite tools have mining
  tiers, speed and saved durability. Ancient debris smelts into scrap; four scrap
  and four gold craft an ingot for diamond-equipment upgrades.
- Hearts represent 20 HP. Food restores hunger, saturation and health. Saturation
  drains before hunger; hunger at six or below disables sprinting. Well-fed
  players regenerate and starving players lose health. Fall damage is enabled.
- Hunting cows, pigs, chickens and sheep supplies food and wool. Fishing rods
  cast into nearby water; use again during the bite window. Hoe grass/dirt, plant
  seeds, and harvest mature wheat. Water accelerates crop growth. Bread and
  cooked meat/fish are available. Crop growth is two minutes while loaded,
  accelerated near water. Collect wheat seeds from grass and occasional apples from leaves.
- The server clock completes 24,000 ticks in 20 minutes of active play: ten
  minutes of daylight, 90 seconds of transitions, and 8.5 minutes of night.
  Zombies, skeletons, creepers, spiders and Endermen spawn in darkness. Endermen
  become aggressive when attacked or looked at and teleport. Skeletons shoot,
  creepers explode, spiders climb short obstacles, and shelters block sight.
- Beds set a safe personal respawn at any time; all living connected
  players must sleep to skip night. Otherwise respawn uses the saved original
  world spawn. Death drops carried items and equipped gear into the shared world.
- 36 material-stack slots include the nine hotbar slots, with up to 64 items in
  each. Click a backpack stack to swap it with your selected hotbar slot. The
  separate off-hand button moves a stack to/from off-hand storage. Armor and
  shields equip from the inventory; hold F to block attacks from the front.
- Chests hold 27 stacks and share saved contents. Right-click to open, store your
  selected stack, or click contents to withdraw. Furnaces consume fuel and smelt
  one item per ten seconds; blast furnaces smelt ores in five seconds and reject
  food. Output remains in the furnace until collected. Jobs save with the world.
- Press R to eat, G/right-click to use, E for inventory, F5 to cycle first person,
  third-person back and third-person front. The camera clips against solid
  terrain. Mining feedback uses cracks only, with no bar or pickup notifications.

The world clock, mobs, station contents, crops, player vitals, saturation,
equipment, durability and slot layout save in the same private SQLite world
store. The simulation pauses when no one is connected. This implementation uses
server-validated cursor stacks and manually arranged crafting grids. Durable equipment currently shares condition by
item type; separate instances of the same tool do not have independent wear.
Legacy inventory totals exceeding 36 stacks are preserved in storage; collection
and recipes cannot grow an already overflowing bag. No deployment is performed
by building the assets.


## If the HUD is missing on the live site

The live Cloudflare site and this workspace draft are separate versions. A read
of `https://study.stogademy.workers.dev/orbitcraft/` during diagnosis showed the
older page without `health-meter` or `hunger-meter`, and its JavaScript lacked
the survival UI. That is a deployment mismatch, not a hidden HUD setting.

The corrected package identifies itself as `orbitcraft-survival-pvp-5`. Its
`/orbitcraft/health` response includes that release, and the game HTML includes
an `orbitcraft-release` meta tag with the same value. The build verifies the HUD
markup, sprites, styles and scripts in the packaged site against source. The
Orbit game iframe and game entry assets have new version URLs.

To update Cloudflare when deployment is authorized, run `npm run deploy:cloudflare`
from the orbitcraft folder. This rebuilds and deploys the complete Worker plus
assets. Updating only the workspace or uploading static files does not update
the multiplayer server. Reload Orbit after deployment. Health/hunger appear
once connected to the world and are intentionally hidden in the inventory.


## Player-versus-player combat

PvP is enabled for connected players in the public world. Aim at a player and
hold left click, or hold the same mine/attack control on touch. The server casts
one melee ray up to three blocks: the nearest living player or mob is selected,
and solid blocks stop the ray. Clients cannot choose a victim or send damage.

Bare hands deal one damage; owned, selected weapons use their tool damage and
lose durability. Attacks share a 650 ms cooldown and player damage has a 700 ms
recovery interval. Armor reduces damage and wears down. A raised off-hand shield
reduces frontal damage; attacks from behind bypass it. Shield input must be fresh.

Taking a hit wakes a sleeping player and cancels fishing. The attacker receives
a brief crosshair hit marker; the victim gets a red edge flash and updated real
health. Dead avatars disappear until respawn. Death drops the victim's inventory,
armor and off-hand items once, and the existing bed/world-spawn rules apply.

Victim health, gear and loot, plus attacker weapon wear and exhaustion, commit
in one SQLite transaction in both Node and Cloudflare runtimes. Failed saves
restore both players and do not emit a successful combat event or create loot.
This update is prepared in the draft; a Cloudflare deployment is needed to
change the live game's rules.

### Classic presentation and daytime combat rules

The in-game chrome uses square gray controls, pixel item icons and the existing
nine-slot survival HUD, with a classic blue sky. Hostile creatures spawn only at
night and burn gradually after dawn; passive animals remain.
Left-click or the touch mine/attack button sends an immediate server-validated
melee attempt and holding continues attacks. Reach, line of sight, cooldown,
armor, shields, durability and PvP persistence still apply. Mob hits now produce
the same crosshair confirmation as PvP. Existing worlds and builds are retained.

The compact inventory reference layout has four armor slots, a separate off-hand
slot, a black live character preview, a 2×2 hand grid (3×3 at a crafting table),
27 backpack slots and nine hotbar slots. Recipe selection remains available;
extra inventory instructions and the equipment action are under Inventory controls.
The shared original pixel character uses a teal shirt and blue-purple trousers.


### Cursor crafting and furnace slots

Inventory stacks can be picked up and placed with a left click. Right-click an
inventory stack to take half; right-click a destination to place one. Items
follow the cursor. Hand crafting is 2×2 and a placed crafting table opens 3×3;
matched output is collected onto the cursor. Recipes accept translated/mirrored
shapes and validate resources on the server. The recipe book lists ingredients.

Furnaces have persistent shared raw-input, fuel and output slots and automatically
start the next available job. A closing inventory returns carried items and
crafting inputs to the bag; overflow drops into the world. Cursor/grid state is
saved with the player, returned safely on reconnect and included in death loot.
Station destruction drops its remaining input and fuel. All slot operations use
the existing transactional persistence and rollback. Right-click in the world
suppresses the browser menu; the cursor is released only for an inventory/station
interface. Shift-click armor still equips it.

### GUI scale and classic controls

Inventory, crafting tables, furnaces and chests automatically scale up to 2.2×
while fitting the available width and height. The carried icon follows the
correct scaled pointer position. Per-slot stack counts now persist alongside
legacy aggregate counts; old saves remain compatible.

WASD walks, Space jumps, Shift sneaks with ledge protection, Ctrl or double-W
sprints. Q drops one item, Ctrl+Q drops the selected stack, and F swaps that
stack with the off-hand. A shield now blocks while right-click is held.
Double-Space toggles flight only for a server-authorized creative player;
Space/Shift ascend/descend. The public world remains survival.

Shift-click quickly transfers to/from chest, furnace and crafting slots.
Shift-double-click transfers all matching items between bag and chest.
Number keys select a hotbar slot in the world and swap the hovered container
slot into that hotbar slot in an interface. Left-drag divides a carried stack
evenly; right-drag puts one into each visited slot. The server validates every
transfer and preserves individual split stacks and shared chest contents.

F1 toggles HUD, F2 downloads a world PNG, F3 toggles live coordinates/FPS/biome,
F5 cycles three perspectives, F11 toggles fullscreen. F3+A reloads surrounding
chunks without dropping edited terrain; F3+B toggles server-sized entity
hitboxes. Browser or OS-reserved shortcuts can be handled by the browser.

### Visible left hand and profile names

The inventory off-hand slot accepts carried stacks with the same left/right
click rules as other slots; F still swaps hands. A persistent HUD slot shows the
left-hand item and count. First person renders a mirrored left hand and its item
(including narrow-screen placement), third person and other players render it
on the left arm, and the inventory character preview shows the same equipment.
Shields keep their dedicated left-hand model. Empty hands remain visible during
normal first-person play; interfaces use the off-hand slot/character preview.

Production identity uses verified profile first_name + last_name for player
labels, join notices and new chat messages, with a full display-name fallback
for legacy profiles and "Player" when no full name is available. The username
is never used as the displayed game name. Authentication UUIDs, inventory keys
and existing world saves are unchanged; reconnect to refresh an authenticated
player's name. Historical chat messages retain the name stored when sent.

### Station reference faces, torches, boats and live drag feedback

Crafting tables now have an inset 3×3 top and wooden tool panels. Furnaces have
separate mottled stone tops/walls and an inset two-opening front. The same atlas
mapping is used for world blocks, held items, drops and inventory icons.

Coal above a stick crafts four torches in hand or table crafting. Torches are
placeable non-solid light sources on dry solid ground, persist as world edits,
and drop if their support is mined. Client lights are bounded to the closest
four torches (two on touch devices); nearby torches prevent hostile spawning.
Five oak planks arranged in a U at a table craft one rideable oak boat, with its own pixel icon for holding, storage and drops.

During a carried-stack drag, visited slots now show live item/count previews:
left-drag rebalances evenly as more slots are visited; right-drag shows one per
visited slot. Mouse release still commits the server-validated transaction
atomically. Background updates preserve the preview, and closing/cancelling
removes it without duplicating resources. A drag cannot select more slots than
there are carried items.

### Classic menus, controls and furniture

Escape opens the classic pause layout. Options opens editable keybindings, saved
on this browser, including mouse actions and hotbar keys. Left Ctrl now toggles
sprint with a tap; double-tapping forward also enables it. Closing inventory,
stations, chat or the pause menu requests pointer lock automatically.

A right-hand tool leaves block placement to the off-hand stack. The server
validates the source hand and consumes that stack atomically. Crafting, chest
and furnace panels use local pixel lettering and classic gray slot layouts.
Chest models have a separate lid, dark seam and metal latch. The classic
character has teal clothing, blue trousers and original pixel skin painting.

New white beds occupy two adjacent supported cells, oriented with the player.
Both halves are persisted together; using either half sleeps/sets spawn and
breaking either half drops one bed. Blocked placement and failed persistence
roll back both halves and the item. Existing single-cell beds remain usable.

### Expanded world and chunk lifecycle

The shared map now spans X/Z -512 through 511 (64 × 64 chunks). Each chunk
contains a complete 16 × 16 × 56 column. The original generation seed, height,
version and database identity are unchanged: the existing central terrain is
byte-identical, and edits, player inventories and stations remain in SQLite.
No world reset or migration is needed.

Clients request nearby columns nearest first. Esc → Options sets render distance
to 1–4 chunks; the default is 3 on desktop and 2 on touch devices. A one-chunk
retention band avoids constant rebuilding at borders. Leaving that band releases
chunk geometry and local edit/bed/crop/light caches. Only nearby player, mob and
dropped-item states are streamed; online count still includes the whole server.
F3 shows chunk coordinates, loaded/loading columns and both distances. F3+A
reloads current columns from the authoritative server. Missing columns block
movement until received, preventing falling through terrain or temporary builds.

The server generates one requested column per tick, prioritizing distance and
rotating between players. Requests and queues are bounded to the allowed view.
Distant dense terrain buffers are evicted and the global buffer cache is capped
at 256 chunks; sparse saved edits remain authoritative when regenerating.
Terrain/tree memoization is also bounded during long exploration.

Simulation uses a fixed horizontal radius of 2 chunks around every living player,
independent of Y or render distance. Mobs, item physics/pickup, crops and fuelled
furnaces tick in that area. Outside it, entity motion and farm/furnace progress
pause. Timers retain their remaining duration across returns and restarts; they
do not catch up for unloaded time. Another nearby player keeps the area active.
Sleep advances daylight without fast-forwarding crop and furnace jobs. Daylight
burns active hostile mobs gradually; unloaded mobs pause until their chunks activate.

Validation includes legacy terrain checksums, positive/negative and edge chunk
addresses, the old/new world borders, nearest-first/fair request scheduling,
bounded cache eviction, persistence, pause/resume of farms/furnaces/entities,
vertical independence, multiplayer activity and a real browser round trip beyond
the old border with streamed meshes unloading and a saved build reloading.

### Hold to eat

Hold right-click with food selected for 1.6 seconds to eat. The first-person
food/hand bobs toward the mouth and third-person players raise the food arm;
nearby players receive the eating state. Continuing to hold repeats the full
duration for each item until hunger is full or the food runs out.

The server measures each hold and consumes food, restores hunger/saturation and
heals in a single saved transaction. Releasing, switching slots, mining, opening
a menu, dying, losing input heartbeats or already-full hunger cancels progress.
Hold the Use control or the touch Eat/Use button for the same behavior; there is no separate Eat keybind.
Legacy eat/use packets cannot consume food instantly. No progress bar is added.
The F5 camera-cycle function was also restored and checked with the eating pose.

### Survival details and minimal HUD

Opening Orbitcraft now automatically authenticates and joins the world. The old
opening card, game logo/header buttons and coordinate display are removed from
the normal view. Authentication errors still show sign-in/reconnect controls.
Tests can explicitly request `?manualJoin=1` for local connection fixtures.
T opens chat; received/sent messages fade after five seconds. Hold Tab for a
server-supplied roster of every connected player's verified name. Escape retains
menus, configurable keybindings and inventory access through E.

Beds set respawn during the day without sleeping. Night use raises a saved
sleeping state with a lying character pose and screen fade. When all living
players have slept for two seconds, sunrise occurs. Escape or Leave Bed wakes
the player. New spawn records carry a bed token: breaking/replacing that bed
invalidates the spawn even at the same coordinates, including across reconnects.

Boats are persistent shared entities: right-click a boat item to place/board it,
steer with movement keys, and hold Shift to dismount. Server and client share
floating/steering physics; riders are exempt from fall damage, while dismounting
restores ordinary damage. Death and disconnect release the boat for other riders.
Three iron ingots in a V at a crafting table make a bucket. Scooping and pouring
water atomically exchange empty/full buckets and save the water edit.

Torches attach to floors or horizontal wall faces. Their stepped narrow boxes
are shared by ray selection, outlines and 3D models; they remain non-solid and
drop ordinary torch items if their support is mined. Grass, poppies and daisies
are real collectible cutouts in previously decorative positions; stored edits
still override them. Grass can also drop wheat seeds. Leaves have a chance to
drop an apple and no longer drop wheat seeds. Base terrain and ore generation
remain unchanged under the new plant overlay.

All material/food/tool/armor item icons are pixel silhouettes shared by inventory,
hands and rotating dropped-item sprites. Buckets, fish, seeds, wheat, apples,
bones, wool, string, ingots and gems have distinct shapes instead of the generic
lump. Combat adds a brief red tint, collision-checked knockback, and a falling
death pose for mobs and other players. Respawn restores the standing model.

Spawning enforces category caps within a sliding 17 × 17 horizontal chunk area:
70 hostile, 10 passive, 15 ambient, 5 water creatures, 20 water ambient and 5
underground-water creatures. Bats, squid, dolphins, cod/salmon/fish and axolotls
have corresponding habitat spawning and models. Existing hostile creatures burn
to death during daylight and drop loot; they are not instantly deleted at dawn.
The server retains a separate 2,048-entity safety bound for the finite world.

Checks cover day/night spawn setting, bed invalidation, sleep delay/pose, bucket
recipe and saved water transfer, narrow wall-torch raycasts and support drops,
plant/leaf loot, mounted/unmounted fall damage, six mob caps, burning/loot, auto
join, hidden toolbar, T chat fade, global Tab roster, red hit feedback and shaped
armor drops. Crafting/furnaces, held eating, PvP and Cloudflare persistence also
receive regression checks.

### Snow reference and inventory cursor tracking

Snow ground blocks now use a cool white top, uneven deep snow over dirt sides,
and the ordinary dirt underside. World, held/drop models and icons share this
face mapping. The inventory's character preview turns its head and upper body
toward the cursor, using the displayed canvas bounds so GUI scaling works.
Pointer-driven renders are limited to one animation frame at a time and run
only while the inventory is open. The separate Eat binding/R shortcut has been
removed; hold-right-click eating and mobile touch eating remain available.

### Water flow, experience HUD and jump timing

Water is now simulated authoritatively at a bounded rate (64 active updates
every quarter-second). Poured water and exposed natural water fall first, spread
up to seven horizontal levels around solid obstacles, wash out plants/torches,
and recede after losing their source. Flow level metadata and block edits save
together; flow resumes after restart and pauses outside simulation distance.
Chunk loading seeds exposed water edges, and mining/building/buckets schedule
neighbor updates. The render shader scrolls water texels to show movement.

The compact nine-slot hotbar now includes actual equipment armor points, an
experience progress bar, green level number and colored tool/shield durability
strips. Animal kills grant two XP, player-killed monsters five XP, mature crop
harvests one XP, and collected smelted output one XP per item. Small green pixel
orbs move toward nearby living players and save XP atomically on pickup. Raw
materials/fuel alone do not grant XP, and repeatedly clicking empty furnace
output cannot grant more. Orbs persist with the world; death clears XP and drops
a bounded share. Increasing level costs follow the classic survival progression.
The armor and XP HUD also obey F1 and inventory hiding.

Normal dry-ground jumps use shared gravity 28 and launch velocity 8.4, integrated
with a half-step launch correction so return to the same height takes 0.6 seconds
at both server 20 Hz and client 60 Hz. Jump height is about 1.26 blocks; swimming
and creative flight retain separate controls.

Validation adds water descent/obstacle routing/range/draining/persistence/pause
and rollback checks; animal/crop/furnace orb rewards and pickup rollback; level
math and 0.6-second jump checks at both step rates. Browser checks verify visible
XP progression, armor points, durability strips, animated water without shader
errors, and HUD hiding. The earlier snow, cursor-following preview and removal
of the separate Eat binding remain in this release.

### Classic death screen

Death now overlays the live world with a translucent red tint, pixel “You died!”
heading, yellow score and the two classic Respawn / Title screen buttons. Score
records XP earned during that life before XP is cleared/dropped. Controls enable
after one second to avoid accidental clicks. Mouse lock releases on death,
menus/HUD hide, Tab switches the two choices, and Enter activates the focused
choice. Respawn restores health and automatically requests crosshair focus.
Title screen disconnects safely and returns to Orbit Games. Reconnecting while
dead retains the score and functional death screen.

The real-browser death check covers a lethal attack while pointer-locked, score
persistence, title navigation, no accidental pause overlay, and respawn/focus.
