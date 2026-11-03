# Orbitcraft

Orbitcraft adds a real multiplayer voxel sandbox to the supplied Stogademy site.
It appears immediately below Orbit Casino inside Orbit Fun, and in the Orbit
Games catalog. No other game scripts, casino code, shop code, or database tables
were changed.

## What you receive

- One public 128 × 128 × 56 block world, shared by everyone on this deployment.
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
  it for the 3×3 recipe selector. Recipes show ingredients and consume them on
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
  accelerated near water. Obtain seeds and apples from leaves.
- The server clock completes 24,000 ticks in 20 minutes of active play: ten
  minutes of daylight, 90 seconds of transitions, and 8.5 minutes of night.
  Zombies, skeletons, creepers, spiders and Endermen spawn in darkness. Endermen
  become aggressive when attacked or looked at and teleport. Skeletons shoot,
  creepers explode, spiders climb short obstacles, and shelters block sight.
- Beds set a safe personal respawn when used at night; all living connected
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
recipe selection with automatically arranged ingredient previews, not cursor
placement of arbitrary recipes. Durable equipment currently shares condition by
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
night and disappear at dawn, including those underground; passive animals remain.
Left-click or the touch mine/attack button sends an immediate server-validated
melee attempt and holding continues attacks. Reach, line of sight, cooldown,
armor, shields, durability and PvP persistence still apply. Mob hits now produce
the same crosshair confirmation as PvP. Existing worlds and builds are retained.

The compact inventory reference layout has four armor slots, a separate off-hand
slot, a black live character preview, a 2×2 hand grid (3×3 at a crafting table),
27 backpack slots and nine hotbar slots. Recipe selection remains available;
extra inventory instructions and the equipment action are under Inventory controls.
The shared original pixel character uses a teal shirt and blue-purple trousers.
