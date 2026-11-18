-- One game_results row per player per game, for games saved from 2026-11-18
-- on, so a result save that is retried (game-server persistResults and
-- retryResults, frontend logGameResults) can never count twice. The repeat is
-- refused: the game server reads the 409 as saved, and record_bot_result
-- already turns the refusal into 'duplicate'.
--
-- Older rows are left out on purpose. 52 player-game pairs saved before this
-- have extra copies (56 rows: 17 bot games, the rest old multiplayer games),
-- and deleting them would lower those players' points. That clean-up is a
-- separate decision.
--
-- Run in the Supabase SQL Editor BEFORE the code that retries goes live. The
-- build blocks result saves for well under a second; it gives up, changing
-- nothing, if it cannot get the lock within 2 s or runs past 5 s.

begin;

set local lock_timeout = '2s';
set local transaction_timeout = '5s';

create unique index if not exists game_results_one_row_per_player_game
    on public.game_results (game_id, user_id)
    where played_at >= '2026-11-18 00:00:00+00';

commit;
