# Orbitcraft

Orbitcraft adds a real multiplayer voxel sandbox to the supplied Stogademy site.
It appears immediately below Orbit Casino inside Orbit Fun, and in the Orbit
Games catalog. No other game scripts, casino code, shop code, or database tables
were changed.

## What you receive

- One public 128 × 128 × 56 block world, shared by everyone on this deployment.
- Original pixel textures, first-person 3D blocks, trees and forests, desert,
  meadow, alpine mountains, water and underground caves.
- Server-controlled movement, collision, jumping, swimming, mining and building.
- Other connected players with Orbit usernames above their block avatars.
- A persistent resource inventory, eight-slot hotbar, and log-to-plank crafting.
- Public multiplayer chat with recent history saved.
- Keyboard/mouse and touch controls.
- Cloudflare Worker + SQLite Durable Object backend, and a Node.js local server.

There are no bots or simulated online players. Local development identities
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

## How the backend works

The browser connects to same-origin `/orbitcraft/socket` using WebSockets. One
Durable Object, named `orbitcraft-public-v1`, owns the entire public world. Its
SQLite database stores block deltas, player inventories, positions, statistics,
and recent chat. The world terrain is deterministic; buildings and mined blocks
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
no PvP, no mobs, and no fluids simulation. Water supports swimming. Snow, logs,
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
movement, shared placement, chat, crafting, reconnect saves, and mobile layout.
It expects the local development server on port 8787 and Chromium at
`CHROMIUM_PATH` (or `/usr/bin/chromium`). Screenshots go to `ARTIFACT_DIR` (or
`/workspace/artifacts`). On other systems set those paths before running it.

No live deployment has been performed by creating this package. Publishing
requires signing into your Cloudflare account using the steps above.
