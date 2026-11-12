# Remove cartridge round reward caps

The frontend removes the 100,000-Orbit preview clamp and prepares a replacement
for the Supabase function that capped rewards at 20,000 (or 100,000 on some
installations). Rewards now use the full rounded score × the owner's current
payout percentage. The preview uses integer-permille arithmetic to match SQL,
including for large rewards. Game pages load updated bank/leaderboard scripts.

## Apply to live rewards

This workspace has no Supabase administrator connection. Publishing static game
files cannot replace the database payout function.

1. Open the **Orbit Supabase project → SQL Editor → New query**. Use the project
   that contains `orbit_ledger` and `game_rates`, not the separate score boards.
2. Run the full `chatter/migration-game-payouts-uncapped.sql` file **last**, after
   the existing game-rate setup. Do not rerun older capped payout migrations.
3. Publish/deploy the updated game frontend and reload the games.

The migration preserves current payout rates, supported games, existing score
validation (up to 10,000,000 points), the 15-second per-user/per-game claim
cooldown and one payout per round reference. It also lets the ledger accept
large positive game rewards, without changing limits for other reward/spend
reasons. Retrying a previously paid round returns zero and grants nothing.

Existing balances and past capped payouts are not recalculated. Original scores
are not stored in the payout ledger, so this update cannot reconstruct past
underpayments. The script does not include the unrelated member grant found in
the older 100,000-cap migration.

## Checks

`games/test/cartridge-payouts.check.mjs` uses the real OrbitBank preview and a
local PostgreSQL database to verify rewards above 20k, 100k and 1m, including a
1-billion reward at the largest existing validated score/rate. It checks exact
rounding, malformed input, anonymous access, cooldowns, repeated round refs,
owner-defined rates, unchanged unrelated ledger limits and safe reruns.
The migration is verified locally. A Supabase project administrator must apply it to the live database; a Render deployment cannot apply SQL.

Direct SQL file: https://raw.githubusercontent.com/yualan480/Stogademy/main/chatter/migration-game-payouts-uncapped.sql

Copy the entire file into a new SQL Editor query, from `begin;` to `commit;`. The current game-rate-table setup also installs this uncapped function.
