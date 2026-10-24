-- Daily board: find likely fake scores. Read-only; run in the SQL Editor.
--
-- The browser plays the daily and reports the effort, so the server cannot
-- prove a score. What it can see: everyone plays the same deal, so the best
-- real line is usually found by several players and the top efforts cluster.
-- A fake shows up as a lone winner well below the rest of the day.
--
-- No fixed floor works instead: real wins at effort 2 exist (a Discard All
-- or a hand swap can end a game in two moves).
--
-- Flags a day's #1 who is alone at that effort and at least 3 below the
-- next winner, for the last 14 days. Review by hand before removing.

with wins as (
    select gr.id, gr.game_id, gr.user_id, p.username, gr.played_at,
           gr.cards_played_total + gr.draws_taken as effort,
           gr.game_duration_secs as duration_secs
    from game_results gr
    left join profiles p on p.id = gr.user_id
    where gr.game_id like 'daily-%'
      and gr.result = 'won'
      and gr.played_at > now() - interval '14 days'
), leaders as (
    select w.*,
           count(*) over (partition by game_id, effort) as tied,
           rank() over (partition by game_id order by effort) as rk,
           (select min(o.effort) from wins o where o.game_id = w.game_id and o.effort > w.effort) as next_best
    from wins w
)
select id, game_id, username, user_id, effort, next_best, duration_secs, played_at
from leaders
where rk = 1 and tied = 1 and next_best - effort >= 3
order by game_id desc;

-- To remove a confirmed fake (one row, by id from the result above):
-- delete from game_results where id = '<id>';
