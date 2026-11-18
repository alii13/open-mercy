-- The four all-time rank functions and the country list, reading
-- player_alltime_totals instead of re-scoring every game. Run in the Supabase
-- SQL Editor AFTER alltime-score-totals.sql. It only replaces function bodies
-- (same signatures, same columns, grants kept), so the app needs no release.
--
-- Undo: run alltime-ranks-from-totals-undo.sql, which puts the bodies that
-- aggregate game_results back. The totals tables and trigger can stay.
--
-- These are copies of the definitions in the source files named above each
-- one; the source files carry the same change, so re-running any of them keeps
-- it. Do not run this file again after a source file changes.

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
            t.user_id,
            coalesce(p.username, 'PLAYER') as username,
            p.share_code,
            p.country,
            p.equipped_card_back as skin,
            t.games,
            t.wins,
            t.points
        from player_alltime_totals t
        left join profiles p on p.id = t.user_id
        where p_country is null or p.country = p_country
    )
    select
        -- Same points, fewer games played is the sharper player. Exact ties
        -- fall back to user_id so every surface shows the same rank.
        row_number() over (order by s.points desc, s.games asc, s.user_id asc) as rank,
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
        select t.user_id, t.games, t.wins, t.points
        from player_alltime_totals t
        left join profiles p on p.id = t.user_id
        where p_country is null or p.country = p_country
    ),
    ranked as (
        select user_id, games, wins, points,
               row_number() over (order by points desc, games asc, user_id asc) as rnk
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
        select user_id, games, points from player_alltime_totals
    ),
    ranked as (
        select user_id, row_number() over (order by points desc, games asc, user_id asc) as rnk
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

-- alltime_countries (source: supabase/leaderboards-alltime.sql)
create or replace function public.alltime_countries()
returns table (country text, players bigint)
language sql
security definer
set search_path = public
stable
as $$
    select p.country, count(*) as players
    from player_alltime_totals t
    join profiles p on p.id = t.user_id
    where p.country is not null
    group by p.country
    order by players desc, p.country asc;
$$;
grant execute on function public.alltime_countries to anon, authenticated;

