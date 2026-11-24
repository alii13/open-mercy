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
        select sum(d.points)::bigint as points
        from (
            select
                gr.user_id,
                sum(
                    (
                        case when (gr.is_bot_game or gr.cards_played_total >= 5) then
                            case gr.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
                        else 0 end
                        + gr.draw_cards_played * 2
                        + gr.biggest_stack_survived * 3
                        + gr.uno_calls * 4
                    ) * gr.points_multiplier
                ) + 25 * max(gr.points_multiplier) as points
            from game_results gr
            where gr.user_id is not null
            group by gr.user_id, (gr.played_at at time zone 'UTC')::date
        ) d
        group by d.user_id
    )
    select t.threshold,
           count(*) filter (where p.points >= t.threshold) as players,
           count(*) as total
    from unnest(thresholds[1:20]) as t(threshold)
    cross join p
    group by t.threshold;
$$;

grant execute on function public.badge_holders to anon, authenticated;
