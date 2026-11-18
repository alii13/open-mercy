-- Undo for alltime-ranks-from-totals.sql: puts back the four all-time rank
-- functions that aggregate game_results on every call (the bodies on main
-- before 2026-11-18). Same signatures and columns, grants kept.

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
grant execute on function public.alltime_leaderboard to anon, authenticated;

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
grant execute on function public.alltime_my_rank to anon, authenticated;

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
grant execute on function public.alltime_ranks(uuid[]) to anon, authenticated;

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
grant execute on function public.profile_rank to anon, authenticated;

