-- House players at public tables (game-server/src/house.ts).
--
-- A public table with fewer than four people is topped up with house seats.
-- They never get a game_results row; each human row records how many sat at
-- the table, so retention and leaderboard queries can tell a house game from
-- an all-human one (`house_count = 0`).
--
-- Additive only. Run BEFORE deploying the game server: rows saved while the
-- column is missing would read as house_count = 0 (all-human) once it exists,
-- and they cannot be told apart afterwards. The server still saves the rows
-- without the count if it ever meets the column missing.

alter table public.game_results
    add column if not exists house_count smallint not null default 0;
