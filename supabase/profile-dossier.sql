-- Dossier sections for the public profile page (/p/<share_code>). Run in the
-- Supabase SQL Editor AFTER profile-pages.sql, leaderboards-alltime.sql
-- (this depends on profiles.share_code + country) and alltime-score-totals.sql
-- (profile_rank reads player_alltime_totals). Additive only: three
-- SECURITY DEFINER functions + grants. No table changes.
--
-- public_profile() returns one row of aggregates, which is enough for the
-- badge and the personal bests but cannot answer two things the dossier shows:
-- where a player stands in the field, and when they took each badge. Both need
-- data that owner-only RLS keeps out of the client, so both are computed here
-- and returned already reduced.
--
-- POINTS ARITHMETIC LIVES IN FOUR PLACES AND MUST BE CHANGED IN ALL FOUR:
--   frontend/src/utils/badges.ts       (POINT_WEIGHTS + aggregateRows) — canonical
--   supabase/badges.sql                (player_points, for explicit user ids)
--   supabase/alltime-score-totals.sql  (the whole field, one game at a time)
--   supabase/profile-dossier.sql       (this file)
-- No test can catch a drift between them: the SQL needs a database. Grep for
-- POINT_WEIGHTS before touching any weight, and keep the walkover guard
-- (is_bot_game or cards_played_total >= 5) identical everywhere.
--
-- profile_promotions ALSO duplicates the tier thresholds from badges.ts BADGES.
-- That is the only copy of the ladder outside TypeScript. Change both together.
--
-- EXPOSURE NOTE: profile_recent_games widens what a public profile shows from a
-- W/L form strip to the last N games in detail. It is deliberately bounded, and
-- returns no game_id and no user_id — only what the activity row renders. If a
-- private-profile setting ever ships, this is the function it has to gate.

-- ---------------------------------------------------------------------------
-- Where this player stands, globally and in their own country.
-- alltime_my_rank answers this for the CALLER via auth.uid(); a profile page is
-- about somebody else, so the target comes from the share code instead.
--
-- Ranks over player_alltime_totals (supabase/alltime-score-totals.sql), the
-- same per-player totals the all-time board reads, so a profile's rank matches
-- the board. Aggregating game_results here instead cost 0.45 s at 33k games
-- (2026-08-29) and 0.4-0.6 s, up to 6.5 s, at 117k games (2026-11-18).
-- ---------------------------------------------------------------------------

drop function if exists public.profile_rank(text);

create or replace function public.profile_rank(p_share_code text)
returns table (
    global_rank bigint,
    global_total bigint,
    country_rank bigint,
    country_total bigint
)
language sql
security definer
set search_path = public
stable
as $$
    with target as (
        select id, country from profiles where share_code = p_share_code
    ),
    scored as (
        select t.user_id, p.country, t.games, t.points
        from player_alltime_totals t
        left join profiles p on p.id = t.user_id
    ),
    global_ranked as (
        select user_id, row_number() over (order by points desc, games asc, user_id asc) as rnk
        from scored
    ),
    country_ranked as (
        select s.user_id, row_number() over (order by s.points desc, s.games asc, s.user_id asc) as rnk
        from scored s
        join target t on t.country is not null and s.country = t.country
    )
    select
        (select g.rnk from global_ranked g join target t on g.user_id = t.id),
        (select count(*) from scored),
        (select c.rnk from country_ranked c join target t on c.user_id = t.id),
        (select count(*) from country_ranked);
$$;

grant execute on function public.profile_rank to anon, authenticated;

-- ---------------------------------------------------------------------------
-- When this player took each badge.
--
-- Derived, never stored: the points formula is replayed over their games in
-- order, and the first game whose running total reaches a threshold is the game
-- that bought that tier. Mirrors frontend/src/utils/promotions.ts, which does
-- the same replay client-side for the signed-in owner (who already holds their
-- own rows and needs no round trip).
--
-- Every term of the sum is non-negative, so the running total only ever grows
-- and the earliest crossing really is the promotion. The distinct-day term is a
-- running count of first-games-of-a-date rather than a plain sum.
-- ---------------------------------------------------------------------------

drop function if exists public.profile_promotions(text);

create or replace function public.profile_promotions(p_share_code text)
returns table (
    tier int,
    threshold bigint,
    at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    with target as (
        select id from profiles where share_code = p_share_code
    ),
    ordered as (
        select
            gr.played_at,
            gr.result,
            gr.is_bot_game,
            gr.cards_played_total,
            gr.draw_cards_played,
            gr.biggest_stack_survived,
            gr.uno_calls,
            gr.points_multiplier,
            -- ponytail: a boosted day's whole bonus lands on its first game, so a
            -- promotion that day can show a few hours early. Totals are exact.
            case
                when row_number() over (
                    partition by (gr.played_at at time zone 'UTC')::date
                    order by gr.played_at
                ) = 1 then max(gr.points_multiplier) over (
                    partition by (gr.played_at at time zone 'UTC')::date
                ) else 0
            end as new_day
        from game_results gr
        join target t on gr.user_id = t.id
    ),
    running as (
        select
            played_at,
            (
                sum(case when result = 'won' and (is_bot_game or cards_played_total >= 5) then points_multiplier else 0 end) over w * 100
              + sum(case when result in ('lost', 'eliminated') and (is_bot_game or cards_played_total >= 5) then points_multiplier else 0 end) over w * 12
              + sum(draw_cards_played * points_multiplier) over w * 2
              + sum(biggest_stack_survived * points_multiplier) over w * 3
              + sum(uno_calls * points_multiplier) over w * 4
              + sum(new_day) over w * 25
            )::bigint as points
        from ordered
        window w as (order by played_at rows between unbounded preceding and current row)
    ),
    tiers (tier, threshold) as (
        values (1, 0::bigint), (2, 250::bigint), (3, 600::bigint), (4, 1300::bigint),
               (5, 2700::bigint), (6, 5500::bigint), (7, 11000::bigint),
               (8, 22000::bigint), (9, 45000::bigint), (10, 100000::bigint),
               (11, 140000::bigint), (12, 196000::bigint), (13, 274000::bigint),
               (14, 384000::bigint), (15, 538000::bigint), (16, 753000::bigint),
               (17, 1050000::bigint), (18, 1480000::bigint), (19, 2070000::bigint),
               (20, 2890000::bigint)
    )
    select ti.tier, ti.threshold, min(r.played_at)
    from tiers ti
    join running r on r.points >= ti.threshold
    group by ti.tier, ti.threshold
    order by ti.tier;
$$;

grant execute on function public.profile_promotions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The last few games, with what each one was worth.
--
-- Bounded and reduced: no game_id, no user_id, no opponent identities. `points`
-- is the same per-game contribution the post-game badge check uses, so the
-- number on a profile row matches the one the player saw when the game ended.
-- The day bonus is excluded, exactly as gameContribution excludes it — a single
-- game cannot know whether it was the first of its day.
-- ---------------------------------------------------------------------------

drop function if exists public.profile_recent_games(text, int);

create or replace function public.profile_recent_games(
    p_share_code text,
    max_rows int default 10
)
returns table (
    played_at timestamptz,
    result text,
    is_bot_game boolean,
    opponent_count int,
    cards_played_total int,
    cards_remaining int,
    peak_cards int,
    biggest_stack_survived int,
    points int
)
language sql
security definer
set search_path = public
stable
as $$
    select
        gr.played_at,
        gr.result::text,
        gr.is_bot_game,
        gr.opponent_count,
        gr.cards_played_total,
        gr.cards_remaining,
        gr.peak_cards,
        gr.biggest_stack_survived,
        (
            (
                case
                    when (gr.is_bot_game or gr.cards_played_total >= 5) and gr.result = 'won' then 100
                    when (gr.is_bot_game or gr.cards_played_total >= 5) and gr.result in ('lost', 'eliminated') then 12
                    else 0
                end
              + greatest(coalesce(gr.draw_cards_played, 0), 0) * 2
              + greatest(coalesce(gr.biggest_stack_survived, 0), 0) * 3
              + greatest(coalesce(gr.uno_calls, 0), 0) * 4
            ) * gr.points_multiplier
        )::int as points
    from game_results gr
    join profiles p on p.id = gr.user_id
    where p.share_code = p_share_code
    order by gr.played_at desc
    limit greatest(1, least(coalesce(max_rows, 10), 50));
$$;

grant execute on function public.profile_recent_games to anon, authenticated;
