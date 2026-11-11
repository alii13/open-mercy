-- Public profile pages (/p/<share_code>). Run in the Supabase SQL Editor
-- AFTER leaderboards-v2.sql (it depends on profiles.share_code + country).
-- Additive only: two SECURITY DEFINER functions + grants. No table changes.
--
-- game_results RLS is owner-select-only; a public profile exposes ONE row of
-- aggregates (never row-level history) plus a 10-game W/L form strip. It also
-- returns user_id so the client can look up the profile's badge via
-- player_points (badges.sql); re-run this (drop + recreate) to pick that up.

drop function if exists public.public_profile(text);

create or replace function public.public_profile(p_share_code text)
returns table (
    user_id uuid,
    username text,
    country text,
    skin text,
    member_since timestamptz,
    games bigint,
    wins bigint,
    eliminations bigint,
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
        count(*) filter (where r.result = 'eliminated') as eliminations,
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

grant execute on function public.public_profile to anon, authenticated;

-- Weekly spotlight cards for the leaderboard page: three different skill
-- archetypes get famous each week, not just the win grinders.

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

grant execute on function public.weekly_spotlights to anon, authenticated;
