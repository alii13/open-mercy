-- The games list and head-to-head on the public profile (/p/<share_code>).
-- Run in the Supabase SQL Editor AFTER profile-dossier.sql and
-- friends-recent.sql (which creates game_results_game_id_idx). Additive only:
-- two SECURITY DEFINER functions and grants. No table changes.
--
-- EXPOSURE NOTE: profile_games widens profile_recent_games. Each row also names
-- the other players in that game with their share codes, so each name links to
-- that player's profile, and it pages through the whole history for the All
-- games page. The owner chose all three on 2026-11-25, knowing the share codes
-- let a script walk from one player to the next. Bots and house players have no
-- profile, so they are never listed. It returns no game_id and no user_id. If
-- a private-profile setting ever ships, this function and profile_recent_games
-- are the ones it has to gate.
--
-- POINTS ARITHMETIC: the per-game points below copy profile_recent_games in
-- profile-dossier.sql exactly, multiplier included. Change both together with
-- POINT_WEIGHTS in frontend/src/utils/badges.ts. walkoverGuardSql.spec.ts
-- checks the walkover guard in this file.

-- ---------------------------------------------------------------------------
-- A page of one player's games, newest first, with the people in each.
--
-- p_before pages backwards: pass the played_at of the last row you have.
-- p_filter is 'all', 'won', 'daily' or 'with_viewer' (games the caller was in).
-- Bot games list no opponents. Multiplayer games list every other player who
-- has a profile; house players have none, so opponent_count can be larger.
-- ---------------------------------------------------------------------------

drop function if exists public.profile_games(text, timestamptz, int, text);

create or replace function public.profile_games(
    p_share_code text,
    p_before timestamptz default null,
    p_limit int default 10,
    p_filter text default 'all'
)
returns table (
    played_at timestamptz,
    result text,
    is_bot_game boolean,
    is_daily boolean,
    opponent_count int,
    cards_played_total int,
    cards_remaining int,
    peak_cards int,
    biggest_stack_survived int,
    points int,
    opponents jsonb
)
language sql
security definer
set search_path = public
stable
as $$
    with target as (
        select id from profiles where share_code = p_share_code
    ),
    page as (
        select gr.*
        from game_results gr
        join target t on gr.user_id = t.id
        where (p_before is null or gr.played_at < p_before)
          and case coalesce(p_filter, 'all')
                when 'won' then gr.result = 'won'
                when 'daily' then gr.game_id like 'daily-%'
                when 'with_viewer' then not gr.is_bot_game and exists (
                    select 1 from game_results v
                    where v.game_id = gr.game_id
                      and v.user_id = auth.uid()
                      and not v.is_bot_game
                )
                else true
              end
        order by gr.played_at desc
        limit greatest(1, least(coalesce(p_limit, 10), 50))
    )
    select
        g.played_at,
        g.result::text,
        g.is_bot_game,
        g.game_id like 'daily-%',
        g.opponent_count,
        g.cards_played_total,
        g.cards_remaining,
        g.peak_cards,
        g.biggest_stack_survived,
        (
            (
                case
                    when (g.is_bot_game or g.cards_played_total >= 5) and g.result = 'won' then 100
                    when (g.is_bot_game or g.cards_played_total >= 5) and g.result in ('lost', 'eliminated') then 12
                    else 0
                end
              + greatest(coalesce(g.draw_cards_played, 0), 0) * 2
              + greatest(coalesce(g.biggest_stack_survived, 0), 0) * 3
              + greatest(coalesce(g.uno_calls, 0), 0) * 4
            ) * g.points_multiplier
        )::int as points,
        coalesce(o.opponents, '[]'::jsonb)
    from page g
    left join lateral (
        select
            jsonb_agg(
                jsonb_build_object(
                    'name', p.username,
                    'code', p.share_code,
                    'you', coalesce(p.id = auth.uid(), false)
                )
                order by coalesce(p.id = auth.uid(), false) desc, p.username
            ) as opponents
        -- distinct: rows saved before 2026-11-18 can repeat a player.
        from (
            select distinct x.user_id
            from game_results x
            where not g.is_bot_game
              and x.game_id = g.game_id
              and x.user_id <> g.user_id
              and not x.is_bot_game
        ) xs
        join profiles p on p.id = xs.user_id
    ) o on true
    order by g.played_at desc;
$$;

grant execute on function public.profile_games to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The caller against this player, across every multiplayer game both were in.
--
-- The caller comes from auth.uid(), never a parameter, so nobody can read the
-- record between two other players. No row when the caller is signed out, is
-- looking at their own profile, or has never shared a table with this player.
-- A game a third player won counts for neither side.
-- ---------------------------------------------------------------------------

drop function if exists public.profile_head_to_head(text);

create or replace function public.profile_head_to_head(p_share_code text)
returns table (
    games int,
    my_wins int,
    their_wins int,
    last_played_at timestamptz,
    last_my_result text,
    last_my_cards int,
    last_my_peak int,
    last_their_result text
)
language sql
security definer
set search_path = public
stable
as $$
    with target as (
        select id from profiles where share_code = p_share_code and id <> auth.uid()
    ),
    shared as (
        select distinct on (m.game_id)
            m.played_at,
            m.result::text as my_result,
            m.cards_remaining,
            m.peak_cards,
            th.result::text as their_result
        from game_results m
        join game_results th on th.game_id = m.game_id and not th.is_bot_game
        join target t on th.user_id = t.id
        where m.user_id = auth.uid()
          and not m.is_bot_game
        order by m.game_id, m.played_at desc
    )
    select
        count(*)::int,
        count(*) filter (where my_result = 'won')::int,
        count(*) filter (where their_result = 'won')::int,
        max(played_at),
        (array_agg(my_result order by played_at desc))[1],
        (array_agg(cards_remaining order by played_at desc))[1],
        (array_agg(peak_cards order by played_at desc))[1],
        (array_agg(their_result order by played_at desc))[1]
    from shared
    having count(*) > 0;
$$;

grant execute on function public.profile_head_to_head to anon, authenticated;
