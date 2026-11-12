# Imported game sources

The following locally hosted game packages were retrieved from the Selenite archive at commit `9c743188888af0986c8c7b293dbac8f9e421a4ee`:

- Subway Surfers: `subway-surfers-ny`
- Geometry Dash: `geometrydash` (Griffpatch's Scratch/TurboWarp browser edition)
- Monkey Mart: `monkeymart`
- Drift Boss: `drift-boss`
- Drive Mad: `drivemad`
- Slope: `slope`
- Vex: `vex` (the original Flash game, rendered with Ruffle)

Archive: https://github.com/selenite-cc/selenite-old/tree/9c743188888af0986c8c7b293dbac8f9e421a4ee . The archive's repository license is retained in `SELENITE-LICENSE.txt`; original game authors and their credits are retained in each package. This does not assign the archive's license to separately owned third-party game assets. Each package's `ORBIT-SOURCE.md` documents local fixes.

Eaglercraft 1.5.2 comes from the source commit documented in `eaglercraft/ORBIT-SOURCE.md`; its upstream license and README are retained. Singleplayer worlds use local browser storage. Orbit does not supply a multiplayer server for this client.

Ruffle 0.7.1 is downloaded from the `@ruffle-rs/ruffle` npm package and hosted in `ruffle/`. Its Apache and MIT license files are retained. Original Flash intro screens and credits are preserved.

The Baloo 2 font used by the Fancade-based Drive Mad runtime is covered by `drive-mad/webapp/Baloo2-OFL.txt`.

All games launch from Orbit's existing alphabetical Unblocked Games gallery, with automatic fullscreen, restart, and gallery-return controls. Assets and engines are loaded on demand when a game is selected.
