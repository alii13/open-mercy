-- Announcements: one modal a signed-in player sees in the lobby, optionally
-- with a points multiplier for players who tap its button. Run once in the
-- Supabase SQL Editor. Additive: until a row exists in announcements, nothing
-- a player sees or scores changes.
--
-- The server decides every boosted game. A trigger stamps
-- game_results.points_multiplier as each result is saved: the announcement's
-- multiplier when one is live at played_at and the player tapped its button
-- at or before played_at, otherwise 1. Whatever a saver sends is overwritten.
-- Browsers cannot insert or update game_results (no insert grant, and RLS has
-- only a select policy), and played_at comes from the server: record_bot_result
-- stamps now(), the game server stamps the game's end and keeps it on retries.
--
-- The six points functions below are copies of their live bodies with the
-- multiplier added; their source files (alltime-score-totals.sql, badges.sql,
-- badge-holders.sql, badge-dates.sql, profile-dossier.sql,
-- badges-prestige.sql) carry the same change, so re-running any of them keeps
-- it. Do not re-run bot-fast-wins.sql or alltime-ranks-from-totals-undo.sql
-- after this: they hold older bodies without the multiplier.
-- pointsMultiplierSql.spec.ts fails if a points statement drops it.

begin;

-- Gives up instead of queueing every game save and sign-up behind its locks;
-- run it again if it times out.
set local lock_timeout = '2s';

create table if not exists public.announcements (
    id text primary key,
    starts_at timestamptz not null,
    ends_at timestamptz not null check (ends_at > starts_at),
    eyebrow text,
    hero text,
    hero_title text,
    hero_note text,
    body text not null,
    -- Only files the site serves from frontend/public/announcements/.
    image_path text check (image_path ~ '^/announcements/[A-Za-z0-9._-]+$'),
    image_caption text,
    button_label text not null default 'OK',
    -- Empty for an announcement with no points.
    points_multiplier smallint check (points_multiplier between 2 and 5)
);

-- One row per player who answered an announcement. skips counts "Not now";
-- the modal is offered at most twice, so after two skips the player is out.
create table if not exists public.announcement_players (
    announcement_id text not null references public.announcements (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    skips smallint not null default 0,
    joined_at timestamptz,
    primary key (announcement_id, user_id)
);

alter table public.announcements enable row level security;
alter table public.announcement_players enable row level security;
revoke all on table public.announcements, public.announcement_players from anon, authenticated;

alter table public.game_results add column if not exists points_multiplier smallint not null default 1;
-- The day bonus follows the biggest multiplier among that day's games.
alter table public.player_play_days add column if not exists multiplier smallint not null default 1;

create or replace function public.stamp_points_multiplier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.points_multiplier := coalesce((
        select max(a.points_multiplier)
        from announcements a
        join announcement_players ap
          on ap.announcement_id = a.id and ap.user_id = new.user_id
        where a.points_multiplier is not null
          and new.played_at >= a.starts_at
          and new.played_at < a.ends_at
          and ap.joined_at <= new.played_at
    ), 1);
    return new;
exception when others then
    -- A failed stamp must never cost a player their saved game: count it once.
    raise warning 'stamp_points_multiplier(%): %', new.user_id, sqlerrm;
    new.points_multiplier := 1;
    return new;
end;
$$;

revoke execute on function public.stamp_points_multiplier() from public, anon, authenticated;

-- Before insert, so the all-time totals trigger (after insert) sees the stamp.
create or replace trigger game_results_points_multiplier
before insert on public.game_results
for each row execute function public.stamp_points_multiplier();

-- The live announcement for the signed-in player, with their answer so far and
-- the server's clock, so a countdown never trusts the phone's clock.
create or replace function public.live_announcement()
returns table (
    id text,
    eyebrow text,
    hero text,
    hero_title text,
    hero_note text,
    body text,
    image_path text,
    image_caption text,
    button_label text,
    points_multiplier smallint,
    ends_at timestamptz,
    server_now timestamptz,
    joined boolean,
    skips smallint
)
language sql
stable
security definer
set search_path = public
as $$
    select
        a.id, a.eyebrow, a.hero, a.hero_title, a.hero_note, a.body,
        a.image_path, a.image_caption, a.button_label, a.points_multiplier,
        a.ends_at, now(),
        ap.joined_at is not null,
        coalesce(ap.skips, 0)::smallint
    from announcements a
    left join announcement_players ap
      on ap.announcement_id = a.id and ap.user_id = auth.uid()
    where auth.uid() is not null
      and now() >= a.starts_at
      and now() < a.ends_at
    order by a.starts_at desc
    limit 1;
$$;

revoke execute on function public.live_announcement() from public, anon;
grant execute on function public.live_announcement() to authenticated;

-- The player's answer: p_join true for the button, false for "Not now".
-- Returns 'joined', 'skipped' or 'closed' (not live, or skipped twice already).
create or replace function public.answer_announcement(p_id text, p_join boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
    answer announcement_players;
begin
    if me is null then return 'closed'; end if;
    if not exists (
        select 1 from announcements
        where id = p_id and now() >= starts_at and now() < ends_at
    ) then return 'closed'; end if;

    insert into announcement_players (announcement_id, user_id)
    values (p_id, me)
    on conflict do nothing;

    select * into answer from announcement_players
    where announcement_id = p_id and user_id = me
    for update;

    if answer.joined_at is not null then return 'joined'; end if;
    if answer.skips >= 2 then return 'closed'; end if;

    if p_join then
        update announcement_players set joined_at = now()
        where announcement_id = p_id and user_id = me;
        return 'joined';
    end if;

    update announcement_players set skips = skips + 1
    where announcement_id = p_id and user_id = me;
    return 'skipped';
end;
$$;

revoke execute on function public.answer_announcement(text, boolean) from public, anon;
grant execute on function public.answer_announcement(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The points functions, each game multiplied by points_multiplier and each
-- day's 25 by the biggest multiplier among that day's games.
-- ---------------------------------------------------------------------------

-- source: supabase/alltime-score-totals.sql
create or replace function public.add_game_to_alltime_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_days integer := 0;
    day_points integer := 0;
    played_day date;
    day_multiplier smallint;
begin
    if new.played_at is not null then
        played_day := (new.played_at at time zone 'UTC')::date;
        insert into player_play_days (user_id, day, multiplier)
        values (new.user_id, played_day, new.points_multiplier)
        on conflict do nothing;
        get diagnostics new_days = row_count;

        if new_days = 1 then
            day_points := 25 * new.points_multiplier;
        else
            -- A boosted game on a day already counted tops the day up once.
            select multiplier into day_multiplier from player_play_days
            where user_id = new.user_id and day = played_day
            for update;
            if new.points_multiplier > day_multiplier then
                update player_play_days set multiplier = new.points_multiplier
                where user_id = new.user_id and day = played_day;
                day_points := 25 * (new.points_multiplier - day_multiplier);
            end if;
        end if;
    end if;

    insert into player_alltime_totals as t (user_id, games, wins, points)
    values (
        new.user_id,
        1,
        (new.result = 'won')::int,
        (
            case when (new.is_bot_game or new.cards_played_total >= 5) then
                case new.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
            else 0 end
            + new.draw_cards_played * 2
            + new.biggest_stack_survived * 3
            + new.uno_calls * 4
        ) * new.points_multiplier
        + day_points
    )
    on conflict (user_id) do update
        set games = t.games + excluded.games,
            wins = t.wins + excluded.wins,
            points = t.points + excluded.points;

    return null;
exception when others then
    -- A failed tally must never cost a player their saved game. The check below finds the drift.
    raise warning 'add_game_to_alltime_totals(%): %', new.user_id, sqlerrm;
    return null;
end;
$$;

revoke execute on function public.add_game_to_alltime_totals() from public, anon, authenticated;

-- source: supabase/badges.sql
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

-- source: supabase/badge-holders.sql
create or replace function public.badge_holders(thresholds bigint[])
returns table (threshold bigint, players bigint, total bigint)
language sql
security definer
set search_path = public
stable
as $$
    with p as (
        select sum(d.points)::bigint as points
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
                ) + 25 * max(gr.points_multiplier) as points
            from game_results gr
            where gr.user_id is not null
            group by gr.user_id, (gr.played_at at time zone 'UTC')::date
        ) d
        group by d.user_id
    )
    select t.threshold,
           count(*) filter (where p.points >= t.threshold) as players,
           count(*) as total
    from unnest(thresholds[1:20]) as t(threshold)
    cross join p
    group by t.threshold;
$$;

-- source: supabase/badge-dates.sql
create or replace function public.my_badge_dates(thresholds bigint[])
returns table (threshold bigint, reached_on date)
language sql
security invoker
set search_path = public
stable
as $$
    with per_day as (
        select (gr.played_at at time zone 'UTC')::date as day,
            (
                sum(
                    (
                        case when (gr.is_bot_game or gr.cards_played_total >= 5) then
                            case gr.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
                        else 0 end
                        + gr.draw_cards_played * 2
                        + gr.biggest_stack_survived * 3
                        + gr.uno_calls * 4
                    ) * gr.points_multiplier
                )
                + 25 * max(gr.points_multiplier)
            )::bigint as points
        from game_results gr
        where gr.user_id = auth.uid()
        group by 1
    ),
    climb as (select day, sum(points) over (order by day) as total from per_day)
    select t.threshold, (select min(c.day) from climb c where c.total >= t.threshold)
    from unnest(thresholds[1:20]) as t(threshold);
$$;

-- source: supabase/badges-prestige.sql (profile-dossier.sql carries the same body)
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

-- source: supabase/profile-dossier.sql
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

commit;

-- ---------------------------------------------------------------------------
-- Owner's notes. Nothing below runs; copy what you need.
-- ---------------------------------------------------------------------------
--
-- Post an announcement (times are India midnight to midnight):
--
-- insert into public.announcements (
--     id, starts_at, ends_at, eyebrow, hero, hero_title, hero_note, body,
--     image_path, image_caption, button_label, points_multiplier
-- ) values (
--     '2026-11-25-10k',
--     '2026-11-25 00:00 Asia/Kolkata', '2026-11-26 00:00 Asia/Kolkata',
--     'WE JUST PASSED 10,000 PEOPLE', '2X', 'POINTS', 'FOR 24 HOURS',
--     'That''s how many of you opened Open Mercy in the last 30 days, more than twice the month before. To say thanks, every point you win counts double until the clock runs out.',
--     '/announcements/ga-10k-2026-11-24.png', 'Our Google Analytics, last 30 days',
--     'COUNT ME IN', 2
-- );
--
-- A plain announcement leaves points_multiplier out; its button just closes it.
--
-- End one early:  update public.announcements set ends_at = now() where id = '2026-11-25-10k';
--
-- Who joined:     select count(*) from public.announcement_players where announcement_id = '2026-11-25-10k' and joined_at is not null;
--
-- After a points day, players worth a look (near-perfect bot wins, non-stop pace):
--
-- select p.username, gr.user_id,
--        count(*) filter (where gr.is_bot_game) as boosted_bot_games,
--        round(avg((gr.result = 'won')::int) filter (where gr.is_bot_game), 2) as bot_win_rate,
--        min(gr.game_duration_secs) filter (where gr.is_bot_game) as fastest_bot_game_secs
-- from public.game_results gr
-- join public.profiles p on p.id = gr.user_id
-- where gr.points_multiplier > 1
-- group by 1, 2
-- order by bot_win_rate desc nulls last, boosted_bot_games desc
-- limit 50;
--
-- Take the bonus back from a player, then re-run alltime-score-totals.sql so
-- the ranks rebuild (badges recompute on their own):
--
-- update public.game_results set points_multiplier = 1
-- where user_id = '<their user_id>' and points_multiplier > 1;
