-- Public points lookup for visible seats (waiting room, game over, every
-- in-game opponent). Run in the Supabase SQL Editor. Additive only: one
-- SECURITY DEFINER function + grant. game_results RLS is owner-select-only,
-- so showing an opponent's badge needs a definer read. Exposes nothing but
-- the computed points and days-idle for explicitly requested user ids.
--
-- Mirrors the weighted sum in frontend/src/utils/badges.ts (POINT_WEIGHTS +
-- aggregateRows). The floored inactivity decay is applied client-side
-- (applyDecay) from `days_idle`, so the tier table lives in one place (TS).
-- Keep the weights and the walkover guard (is_bot_game or cards_played_total >= 5) in sync.
-- The same arithmetic runs a third time in supabase/leaderboards-alltime.sql,
-- which ranks the whole field instead of explicit ids. Change all three.

create or replace function public.player_points(ids uuid[])
returns table (user_id uuid, points bigint, days_idle int)
language sql
security definer
set search_path = public
stable
as $$
    select
        d.user_id,
        sum(d.points)::bigint as points,
        greatest(0, extract(day from (now() - max(d.last_played)))::int) as days_idle
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
            ) + 25 * max(gr.points_multiplier) as points,
            max(gr.played_at) as last_played
        from game_results gr
        where gr.user_id = any(ids)
        group by gr.user_id, (gr.played_at at time zone 'UTC')::date
    ) d
    group by d.user_id;
$$;

grant execute on function public.player_points to anon, authenticated;
