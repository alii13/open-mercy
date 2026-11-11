-- All-time leaderboard. Run in the Supabase SQL Editor AFTER
-- leaderboards-v2.sql (it depends on profiles.share_code + country).
-- Additive only: three SECURITY DEFINER functions + grants. No table changes.
--
-- The board ranks on the same points that drive the badge, so the ladder a
-- player already sees on their profile is the ladder they are ranked by. No
-- second scoring system.
--
-- POINTS ARITHMETIC LIVES IN THREE PLACES AND MUST BE CHANGED IN ALL THREE:
--   frontend/src/utils/badges.ts  (POINT_WEIGHTS + aggregateRows) — canonical
--   supabase/badges.sql           (player_points, for explicit user ids)
--   supabase/leaderboards-alltime.sql (this file, for the whole field)
-- No test can catch a drift between them: the SQL needs a database. Grep for
-- POINT_WEIGHTS before touching any weight, and keep the walkover guard
-- (is_bot_game or cards_played_total >= 5) identical everywhere.
--
-- Decay is deliberately NOT applied here. The badge decay bleeds the surplus
-- above your current tier so a tier never demotes; that is about progress, not
-- standing. An all-time board is a record of what happened, so an inactive
-- player keeps the rank they earned. "Who is hot right now" is the weekly board.

drop function if exists public.alltime_leaderboard(text, int);

create or replace function public.alltime_leaderboard(
    p_country text default null,
    max_rows int default 100
)
returns table (
    rank bigint,
    user_id uuid,
    username text,
    share_code text,
    country text,
    skin text,
    games bigint,
    wins bigint,
    points bigint,
    is_me boolean
)
language sql
security definer
set search_path = public
stable
as $$
    with scored as (
        select
            gr.user_id,
            coalesce(p.username, 'PLAYER') as username,
            p.share_code,
            p.country,
            p.equipped_card_back as skin,
            count(*) as games,
            count(*) filter (where gr.result = 'won') as wins,
            (
                count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
              + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
              + coalesce(sum(gr.draw_cards_played), 0) * 2
              + coalesce(sum(gr.biggest_stack_survived), 0) * 3
              + coalesce(sum(gr.uno_calls), 0) * 4
              + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
            )::bigint as points
        from game_results gr
        left join profiles p on p.id = gr.user_id
        where p_country is null or p.country = p_country
        group by gr.user_id, p.username, p.share_code, p.country, p.equipped_card_back
    )
    select
        -- Same points, fewer games played is the sharper player.
        row_number() over (order by s.points desc, s.games asc) as rank,
        s.user_id,
        s.username,
        s.share_code,
        s.country,
        s.skin,
        s.games,
        s.wins,
        s.points,
        (auth.uid() is not null and s.user_id = auth.uid()) as is_me
    from scored s
    order by 1
    limit max_rows;
$$;

grant execute on function public.alltime_leaderboard to anon, authenticated;

-- The viewer's own standing, even when they sit far below the visible rows.
-- Ranks against the same slice the board is showing, and returns their own
-- totals so the pinned row is complete without a second query. Signed out,
-- my_rank is null and only total_players is meaningful.

drop function if exists public.alltime_my_rank(text);

create or replace function public.alltime_my_rank(p_country text default null)
returns table (
    my_rank bigint,
    total_players bigint,
    games bigint,
    wins bigint,
    points bigint
)
language sql
security definer
set search_path = public
stable
as $$
    with scored as (
        select
            gr.user_id,
            count(*) as games,
            count(*) filter (where gr.result = 'won') as wins,
            (
                count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
              + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
              + coalesce(sum(gr.draw_cards_played), 0) * 2
              + coalesce(sum(gr.biggest_stack_survived), 0) * 3
              + coalesce(sum(gr.uno_calls), 0) * 4
              + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
            )::bigint as points
        from game_results gr
        left join profiles p on p.id = gr.user_id
        where p_country is null or p.country = p_country
        group by gr.user_id
    ),
    ranked as (
        select user_id, games, wins, points,
               row_number() over (order by points desc, games asc) as rnk
        from scored
    ),
    me as (
        select * from ranked
        where auth.uid() is not null and user_id = auth.uid()
        limit 1
    )
    select
        (select rnk from me),
        (select count(*) from ranked),
        coalesce((select games from me), 0),
        coalesce((select wins from me), 0),
        coalesce((select points from me), 0);
$$;

grant execute on function public.alltime_my_rank to anon, authenticated;

-- Countries that have at least one ranked player, biggest field first. A
-- global top 100 is dead for most players; this is what makes the filter
-- worth opening. Countries with nobody in them are never listed.

drop function if exists public.alltime_countries();

create or replace function public.alltime_countries()
returns table (country text, players bigint)
language sql
security definer
set search_path = public
stable
as $$
    select p.country, count(distinct gr.user_id) as players
    from game_results gr
    join profiles p on p.id = gr.user_id
    where p.country is not null
    group by p.country
    order by players desc, p.country asc;
$$;

grant execute on function public.alltime_countries to anon, authenticated;
