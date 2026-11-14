-- How many players have reached each badge tier, for the badges screen
-- ("Held by 1 in 82 players"). Run in the Supabase SQL Editor. Additive only:
-- one SECURITY DEFINER function + grant. Returns counts only, never who.
--
-- Points come from player_points (supabase/badges.sql), so the point weights
-- stay in the places they already live. Thresholds are passed in from
-- frontend/src/utils/badges.ts (BADGES), so the tier table stays in TS.
-- Raw earned points, no decay: a badge, once reached, is never lost.

create or replace function public.badge_holders(thresholds bigint[])
returns table (threshold bigint, players bigint, total bigint)
language sql
security definer
set search_path = public
stable
as $$
    with ids as (select array_agg(distinct user_id) as a from game_results where user_id is not null),
    p as (select pp.points from ids, public.player_points(ids.a) pp)
    select t.threshold,
           (select count(*) from p where p.points >= t.threshold) as players,
           (select count(*) from p) as total
    from unnest(thresholds) as t(threshold);
$$;

grant execute on function public.badge_holders to anon, authenticated;
