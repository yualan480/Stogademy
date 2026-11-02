# Orbit Loop: restore 30yua and require the Sword of Stars

The shop purchase card, price input, purchase RPC call and paid-takeover animation
have been removed. Loop avatars, profile effects, arrival notices and the
leaderboard holder/history remain. The leaderboard rules now explain that only
Sword of Stars challenges can win the Loop. Existing Shield protection, newcomer
protection and challenge cooldowns remain.

## Apply the database change

This draft does not have a Supabase administrator connection. Updating frontend
files does not change the live holder or disable the existing database RPC.

1. Open the **Orbit Supabase project → SQL Editor → New query**.
2. Paste the entire contents of `migration-loop-sword-only.sql` and run it.
3. Reload Orbit. The verified `30yua@tesdk12.net` account will hold the Loop.

The script expects `migration-orbit-game.sql` and `migration-orbit-game-v2.sql`
to have been applied already. Apply the new script **last**. Do not rerun the
older purchase migrations afterward: they would re-enable paid takeovers.

The new migration revokes purchase/event RPC access, blocks direct client
writes, and keeps the internal transfer helper private. The challenge function
requires and atomically consumes a Sword before it can move the Loop. A Shield
blocks the challenge and still consumes the Sword, as before. No Orbits are
charged or refunded by the restoration; existing purchase history remains.

Restoration matches the login email, not an editable display name, and is
recorded once. Rerunning this script will not take the Loop away from someone
who legitimately wins it afterward. If the account/profile is missing, the
transaction aborts without applying a partial update.

## Verification

A local PostgreSQL integration check in `test/loop-sword-only.check.mjs` verified:
restoration to 30yua rather than a spoofed display name; rejected purchases,
event handovers, internal-helper calls and direct writes; rejected challenges
without a Sword; successful Sword transfer and item consumption; Shield-blocked
consumption; cooldown enforcement; and safe migration reruns.

No live database mutation or site publishing was performed.

## Packaged-site correction

The generated `orbitcraft/.site/chatter/shop.js` still contained the old purchase
card after the source edit. That package has now been rebuilt. Wrangler now runs
the asset build automatically for both `wrangler deploy` and `wrangler dev`,
including when invoked from the repository root or the orbitcraft directory.
The npm wrappers rely on this hook, avoiding a duplicate build.

The build rejects the retired Loop purchase RPC/card and verifies that packaged
shop, arena and app entry files exactly match current source. A browser check of
the packaged module confirms the Loop listing is absent, ordinary cosmetic
purchases still work and the real holder's avatar halo remains.

This fixes the packaged frontend. The SQL migration above is still required to
stop backend purchases from older open tabs or direct RPC calls and to restore
live ownership to 30yua; rebuilding static assets cannot update Supabase.
