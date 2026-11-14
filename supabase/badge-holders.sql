-- How many players have reached each badge tier, for the badges screen
-- ("Held by 1 in 82 players"). Run in the Supabase SQL Editor. Additive only:
-- one SECURITY DEFINER function + grant. Returns counts only, never who.
--
-- Same scoring as player_points() in supabase/badges.sql; change the two
-- together. It is repeated here because passing every player id into
-- player_points() took 1.5 s on 111k game_results, and one grouped pass takes
-- 0.26 s (EXPLAIN ANALYZE, 2026-11-14).
-- Thresholds are passed in from frontend/src/utils/badges.ts (BADGES), so the
-- tier table stays in TS; at most 20 are read (there are 20 tiers).
-- Raw earned points, no decay: a badge, once reached, is never lost.

create or replace function public.badge_holders(thresholds bigint[])
returns table (threshold bigint, players bigint, total bigint)
language sql
security definer
set search_path = public
stable
as $$
    with p as (
        select (
            count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
          + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
          + coalesce(sum(gr.draw_cards_played), 0) * 2
          + coalesce(sum(gr.biggest_stack_survived), 0) * 3
          + coalesce(sum(gr.uno_calls), 0) * 4
          + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
        )::bigint as points
        from game_results gr
        where gr.user_id is not null
        group by gr.user_id
    )
    select t.threshold,
           count(*) filter (where p.points >= t.threshold) as players,
           count(*) as total
    from unnest(thresholds[1:20]) as t(threshold)
    cross join p
    group by t.threshold;
$$;

grant execute on function public.badge_holders to anon, authenticated;
