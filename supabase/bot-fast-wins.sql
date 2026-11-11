-- Every bot win scores, however few cards it took. Run once in the Supabase
-- SQL Editor; it only replaces function bodies (same signatures, grants kept),
-- so it is safe to run again.
--
-- The walkover guard (cards_played_total >= 5) stops a multiplayer game that
-- every opponent left from minting win points. A bot never leaves, so the
-- guard was also zeroing real quick wins against bots - 4,004 of them across
-- 1,499 players by 2026-11-11. Counting them is retroactive: points, ranks and
-- the leanest/fastest win records recompute from game_results on the next read.
--
-- These are copies of the definitions in the files named above each one; the
-- source files carry the same change, so re-running any of them keeps it.

-- alltime_leaderboard (source: supabase/leaderboards-alltime.sql)
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

-- alltime_my_rank (source: supabase/leaderboards-alltime.sql)
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

-- alltime_ranks (source: supabase/alltime-ranks.sql)
create or replace function public.alltime_ranks(ids uuid[])
returns table (user_id uuid, rank bigint)
language sql
security definer
set search_path = public
stable
as $$
    with scored as (
        select
            gr.user_id,
            count(*) as games,
            (
                count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
              + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
              + coalesce(sum(gr.draw_cards_played), 0) * 2
              + coalesce(sum(gr.biggest_stack_survived), 0) * 3
              + coalesce(sum(gr.uno_calls), 0) * 4
              + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
            )::bigint as points
        from game_results gr
        group by gr.user_id
    ),
    ranked as (
        select user_id, row_number() over (order by points desc, games asc) as rnk
        from scored
    )
    select r.user_id, r.rnk
    from ranked r
    where r.user_id = any(ids[1:20]);
$$;

-- player_points (source: supabase/badges.sql)
create or replace function public.player_points(ids uuid[])
returns table (user_id uuid, points bigint, days_idle int)
language sql
security definer
set search_path = public
stable
as $$
    select
        gr.user_id,
        (
            count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
          + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
          + coalesce(sum(gr.draw_cards_played), 0) * 2
          + coalesce(sum(gr.biggest_stack_survived), 0) * 3
          + coalesce(sum(gr.uno_calls), 0) * 4
          + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
        )::bigint as points,
        greatest(0, extract(day from (now() - max(gr.played_at)))::int) as days_idle
    from game_results gr
    where gr.user_id = any(ids)
    group by gr.user_id;
$$;

-- profile_rank (source: supabase/profile-dossier.sql)
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
        select
            gr.user_id,
            p.country,
            count(*) as games,
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
        group by gr.user_id, p.country
    ),
    global_ranked as (
        select user_id, row_number() over (order by points desc, games asc) as rnk
        from scored
    ),
    country_ranked as (
        select s.user_id, row_number() over (order by s.points desc, s.games asc) as rnk
        from scored s
        join target t on t.country is not null and s.country = t.country
    )
    select
        (select g.rnk from global_ranked g join target t on g.user_id = t.id),
        (select count(*) from scored),
        (select c.rnk from country_ranked c join target t on c.user_id = t.id),
        (select count(*) from country_ranked);
$$;

-- profile_promotions (source: supabase/profile-dossier.sql)
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
            case
                when row_number() over (
                    partition by (gr.played_at at time zone 'UTC')::date
                    order by gr.played_at
                ) = 1 then 1 else 0
            end as new_day
        from game_results gr
        join target t on gr.user_id = t.id
    ),
    running as (
        select
            played_at,
            (
                sum(case when result = 'won' and (is_bot_game or cards_played_total >= 5) then 1 else 0 end) over w * 100
              + sum(case when result in ('lost', 'eliminated') and (is_bot_game or cards_played_total >= 5) then 1 else 0 end) over w * 12
              + sum(draw_cards_played) over w * 2
              + sum(biggest_stack_survived) over w * 3
              + sum(uno_calls) over w * 4
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

-- profile_recent_games (source: supabase/profile-dossier.sql)
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
            case
                when (gr.is_bot_game or gr.cards_played_total >= 5) and gr.result = 'won' then 100
                when (gr.is_bot_game or gr.cards_played_total >= 5) and gr.result in ('lost', 'eliminated') then 12
                else 0
            end
          + greatest(coalesce(gr.draw_cards_played, 0), 0) * 2
          + greatest(coalesce(gr.biggest_stack_survived, 0), 0) * 3
          + greatest(coalesce(gr.uno_calls, 0), 0) * 4
        )::int as points
    from game_results gr
    join profiles p on p.id = gr.user_id
    where p.share_code = p_share_code
    order by gr.played_at desc
    limit greatest(1, least(coalesce(max_rows, 10), 50));
$$;

-- public_profile (source: supabase/profile-pages.sql)
create or replace function public.public_profile(p_share_code text)
returns table (
    user_id uuid,
    username text,
    country text,
    skin text,
    member_since timestamptz,
    games bigint,
    wins bigint,
    best_win_streak bigint,
    max_stack_survived int,
    max_peak_cards int,
    max_peak_cards_won int,
    min_cards_won int,
    min_duration_won int,
    max_duration int,
    sum_skips bigint,
    sum_draw_cards bigint,
    sum_wild_cards bigint,
    sum_uno_calls bigint,
    sum_swaps bigint,
    daily_played bigint,
    recent_form text[]
)
language sql
security definer
set search_path = public
stable
as $$
    with target as (
        select id, username, country, equipped_card_back, created_at
        from profiles
        where share_code = p_share_code
    ),
    results as (
        select gr.*
        from game_results gr
        join target t on gr.user_id = t.id
    ),
    streaks as (
        -- gaps-and-islands: consecutive wins share the same (rn - rn_within_wins)
        select coalesce(max(len), 0) as best
        from (
            select count(*) as len
            from (
                select row_number() over (order by played_at)
                     - row_number() over (partition by (result = 'won') order by played_at) as grp,
                       result
                from results
            ) marked
            where result = 'won'
            group by grp
        ) islands
    ),
    form as (
        select coalesce(array_agg(result order by played_at desc), '{}') as recent
        from (
            select result, played_at from results
            order by played_at desc
            limit 10
        ) last10
    )
    select
        t.id as user_id,
        t.username,
        t.country,
        t.equipped_card_back as skin,
        t.created_at as member_since,
        count(r.*) as games,
        count(*) filter (where r.result = 'won') as wins,
        (select best from streaks) as best_win_streak,
        coalesce(max(r.biggest_stack_survived), 0) as max_stack_survived,
        coalesce(max(r.peak_cards), 0) as max_peak_cards,
        coalesce(max(r.peak_cards) filter (where r.result = 'won'), 0) as max_peak_cards_won,
        -- Speed/efficiency records require >= 5 cards actually played in
        -- multiplayer: walkover wins (every opponent left) record near-zero
        -- plays and seconds-long durations that aren't real records. A bot
        -- never leaves, so every bot win counts.
        min(r.cards_played_total) filter (where r.result = 'won' and (r.is_bot_game or r.cards_played_total >= 5)) as min_cards_won,
        min(r.game_duration_secs) filter (where r.result = 'won' and r.game_duration_secs > 0 and (r.is_bot_game or r.cards_played_total >= 5)) as min_duration_won,
        coalesce(max(r.game_duration_secs), 0) as max_duration,
        coalesce(sum(r.skips_dealt), 0) as sum_skips,
        coalesce(sum(r.draw_cards_played), 0) as sum_draw_cards,
        coalesce(sum(r.wild_cards_played), 0) as sum_wild_cards,
        coalesce(sum(r.uno_calls), 0) as sum_uno_calls,
        coalesce(sum(r.swaps_made), 0) as sum_swaps,
        count(*) filter (where r.game_id like 'daily-%') as daily_played,
        (select recent from form) as recent_form
    from target t
    left join results r on true
    group by t.id, t.username, t.country, t.equipped_card_back, t.created_at;
$$;

-- weekly_spotlights (source: supabase/profile-pages.sql)
create or replace function public.weekly_spotlights()
returns table (
    kind text,
    username text,
    share_code text,
    country text,
    value bigint
)
language sql
security definer
set search_path = public
stable
as $$
    (
        select 'fastest_win' as kind,
               coalesce(p.username, 'PLAYER'), p.share_code, p.country,
               gr.game_duration_secs::bigint as value
        from game_results gr
        left join profiles p on p.id = gr.user_id
        where gr.played_at > now() - interval '7 days'
          and gr.result = 'won' and gr.game_duration_secs > 0
          -- exclude walkover wins (opponents left, near-zero cards played)
          and (gr.is_bot_game or gr.cards_played_total >= 5)
        order by gr.game_duration_secs asc
        limit 1
    )
    union all
    (
        select 'biggest_stack',
               coalesce(p.username, 'PLAYER'), p.share_code, p.country,
               gr.biggest_stack_survived::bigint
        from game_results gr
        left join profiles p on p.id = gr.user_id
        where gr.played_at > now() - interval '7 days'
          and gr.biggest_stack_survived > 0
        order by gr.biggest_stack_survived desc
        limit 1
    )
    union all
    (
        select 'most_wins',
               coalesce(p.username, 'PLAYER'), p.share_code, p.country,
               count(*) filter (where gr.result = 'won')::bigint
        from game_results gr
        left join profiles p on p.id = gr.user_id
        where gr.played_at > now() - interval '7 days'
        group by gr.user_id, p.username, p.share_code, p.country
        having count(*) filter (where gr.result = 'won') > 0
        order by 5 desc
        limit 1
    );
$$;
