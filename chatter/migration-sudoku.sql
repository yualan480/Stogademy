-- Run once in the ORBIT Supabase SQL Editor (the project with orbit_ledger) after adding Sudoku. Safe to re-run.
-- Run migration-game-rates-table.sql FIRST (it creates the game_rates table this file adds to).

-- 1) Sudoku pays 25% of the final score in Orbits (250 per 1000 points). Re-running does NOT overwrite a rate the owner changed in the admin panel.
insert into public.game_rates (game, permille) values ('sudoku', 250) on conflict (game) do nothing;

-- 2) Sudoku can be picked for Orbit tournaments (Block Out is gone from the list)
create or replace function public.tournament_games() returns text[]
language sql immutable as $$
  select array['game2048','blockblast','breakout','dino','flappy','geodash','girder','minesweeper','pacman','slope','snake','tetris','sudoku',
               'battleship','chess','draw','archery','breakout2p'] $$;
