# Deploy Stogademy to Render

For a Render **Web Service** connected to this repository, use:

| Setting | Value |
| --- | --- |
| Root Directory | Leave blank |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` (the existing `node index.js` command also works) |
| Health Check Path | `/orbitcraft/health` |
| Environment variable | `NODE_VERSION=24` |

Save the settings and select **Manual Deploy → Deploy latest commit**. The root install automatically installs the server's production dependencies in `orbitcraft/`. The launcher uses Render's `PORT` and listens on `0.0.0.0`. The package start command `npm --prefix orbitcraft start` also detects Render's built-in `RENDER=true` environment and defaults to `0.0.0.0`. An explicit `HOST` setting overrides that default.

Alternatively, create a Render Blueprint from the included `render.yaml`.

Orbitcraft world data uses SQLite. Render's free service filesystem is ephemeral: saved world changes can be lost on restart or redeploy. For persistent worlds, attach a persistent disk and set `ORBITCRAFT_DB` to a file on its mount path, for example `/var/data/orbitcraft.sqlite`. Browser game saves and Supabase-backed app data use their existing storage.

This configuration runs the Node server. Cloudflare's Durable Object deployment remains configured separately under `orbitcraft/wrangler.jsonc`.
