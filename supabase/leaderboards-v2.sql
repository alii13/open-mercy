-- Leaderboards v2 — identity, cosmetics, and rank context for the full-page
-- boards. Run in the Supabase SQL Editor (replaces both v1 board functions;
-- the return type changed, hence drop + recreate). Table changes are
-- additive: two nullable profile columns. The share_code default backfills
-- existing rows with distinct codes.
--
-- Re-run after adding badges: both board functions now also return user_id
-- so the client can look up each row's badge via player_points (badges.sql).
--
-- lifetime_wins is always null. No screen reads it, and counting it cost a
-- lookup per row; the column stays so the return type, and so the callers,
-- do not change.

-- Shareable, rename-safe identity for /p/<code> profile URLs.
alter table public.profiles
    add column if not exists share_code text unique
    default substr(md5(random()::text || clock_timestamp()::text), 1, 8);

-- ISO-3166 alpha-2, captured client-side from the CDN's country lookup.
alter table public.profiles
    add column if not exists country text;

drop function if exists public.daily_leaderboard(date, int);

create or replace function public.daily_leaderboard(
    challenge_date date default (now() at time zone 'utc')::date,
    max_rows int default 50
)
returns table (
    rank bigint,
    user_id uuid,
    username text,
    share_code text,
    country text,
    skin text,
    lifetime_wins bigint,
    result text,
    effort int,
    duration_secs int,
    is_me boolean
)
language sql
security definer
set search_path = public
stable
as $$
    select
        row_number() over (
            order by (gr.result = 'won') desc,
                     (gr.cards_played_total + gr.draws_taken) asc,
                     gr.game_duration_secs asc
        ) as rank,
        gr.user_id,
        coalesce(p.username, 'PLAYER') as username,
        p.share_code,
        p.country,
        p.equipped_card_back as skin,
        null::bigint as lifetime_wins,
        gr.result,
        (gr.cards_played_total + gr.draws_taken) as effort,
        gr.game_duration_secs as duration_secs,
        (auth.uid() is not null and gr.user_id = auth.uid()) as is_me
    from game_results gr
    left join profiles p on p.id = gr.user_id
    where gr.game_id = 'daily-' || to_char(challenge_date, 'YYYY-MM-DD')
    order by 1
    limit max_rows;
$$;

grant execute on function public.daily_leaderboard to anon, authenticated;

drop function if exists public.weekly_wins_leaderboard(int);

create or replace function public.weekly_wins_leaderboard(max_rows int default 50)
returns table (
    rank bigint,
    user_id uuid,
    username text,
    share_code text,
    country text,
    skin text,
    lifetime_wins bigint,
    wins bigint,
    games bigint,
    is_me boolean
)
language sql
security definer
set search_path = public
stable
as $$
    select
        row_number() over (
            order by count(*) filter (where gr.result = 'won') desc,
                     count(*) asc
        ) as rank,
        gr.user_id,
        coalesce(p.username, 'PLAYER') as username,
        p.share_code,
        p.country,
        p.equipped_card_back as skin,
        null::bigint as lifetime_wins,
        count(*) filter (where gr.result = 'won') as wins,
        count(*) as games,
        (auth.uid() is not null and gr.user_id = auth.uid()) as is_me
    from game_results gr
    left join profiles p on p.id = gr.user_id
    where gr.played_at > now() - interval '7 days'
    group by gr.user_id, p.username, p.share_code, p.country, p.equipped_card_back
    having count(*) filter (where gr.result = 'won') > 0
    order by 1
    limit max_rows;
$$;

grant execute on function public.weekly_wins_leaderboard to anon, authenticated;

-- Rank context for the viewer: their position and the field size, even when
-- they sit far below the visible top rows.

create or replace function public.daily_my_rank(
    challenge_date date default (now() at time zone 'utc')::date
)
returns table (my_rank bigint, total_players bigint)
language sql
security definer
set search_path = public
stable
as $$
    with ranked as (
        select gr.user_id,
               row_number() over (
                   order by (gr.result = 'won') desc,
                            (gr.cards_played_total + gr.draws_taken) asc,
                            gr.game_duration_secs asc
               ) as rnk
        from game_results gr
        where gr.game_id = 'daily-' || to_char(challenge_date, 'YYYY-MM-DD')
    )
    select
        (select min(rnk) from ranked where auth.uid() is not null and user_id = auth.uid()),
        (select count(*) from ranked);
$$;

grant execute on function public.daily_my_rank to anon, authenticated;

create or replace function public.weekly_my_rank()
returns table (my_rank bigint, total_players bigint)
language sql
security definer
set search_path = public
stable
as $$
    with ranked as (
        select gr.user_id,
               row_number() over (
                   order by count(*) filter (where gr.result = 'won') desc,
                            count(*) asc
               ) as rnk
        from game_results gr
        where gr.played_at > now() - interval '7 days'
        group by gr.user_id
        having count(*) filter (where gr.result = 'won') > 0
    )
    select
        (select min(rnk) from ranked where auth.uid() is not null and user_id = auth.uid()),
        (select count(*) from ranked);
$$;

grant execute on function public.weekly_my_rank to anon, authenticated;
