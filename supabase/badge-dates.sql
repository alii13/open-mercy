-- The day the signed-in player first reached each badge tier, for the
-- "Earned Sep 21" plaques on the badges screen. Run in the Supabase SQL Editor.
-- Additive only: one function + grant.
--
-- SECURITY INVOKER on purpose: game_results RLS is owner-select-only, so this
-- can only ever read the caller's own games. Days are UTC, like player_points.
-- Same scoring as player_points() in supabase/badges.sql, summed per day and
-- accumulated; change them together. At most 20 thresholds are read.

create or replace function public.my_badge_dates(thresholds bigint[])
returns table (threshold bigint, reached_on date)
language sql
security invoker
set search_path = public
stable
as $$
    with per_day as (
        select (gr.played_at at time zone 'UTC')::date as day,
            (
                sum(
                    (
                        case when (gr.is_bot_game or gr.cards_played_total >= 5) then
                            case gr.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
                        else 0 end
                        + gr.draw_cards_played * 2
                        + gr.biggest_stack_survived * 3
                        + gr.uno_calls * 4
                    ) * gr.points_multiplier
                )
                + 25 * max(gr.points_multiplier)
            )::bigint as points
        from game_results gr
        where gr.user_id = auth.uid()
        group by 1
    ),
    climb as (select day, sum(points) over (order by day) as total from per_day)
    select t.threshold, (select min(c.day) from climb c where c.total >= t.threshold)
    from unnest(thresholds[1:20]) as t(threshold);
$$;

grant execute on function public.my_badge_dates to authenticated;
