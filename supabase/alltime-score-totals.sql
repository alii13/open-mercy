-- Every player's all-time games, wins and points, kept up to date as each game
-- result is saved, so the all-time boards and ranks read ~10k rows instead of
-- re-scoring every game on every call. Run in the Supabase SQL Editor BEFORE
-- alltime-ranks-from-totals.sql. Additive: two tables, one trigger function,
-- one trigger.
--
-- Re-run this whole file after any change to POINT_WEIGHTS or the walkover
-- guard: it empties both tables and rebuilds them from game_results, so old
-- games get the new weights too.
--
-- Why a trigger and not a scheduled refresh (2026-11-18): at 117k games the
-- whole-field aggregate cost 0.4-0.6 s per call (up to 6.5 s) and ~13 min of
-- database time a day on the free 0.5 GB instance. A refresh every minute
-- would cost nearly as much, and a slower one leaves ranks behind the badge
-- points players see. The trigger costs two small upserts per saved game.
--
-- game_results rows are never updated. An account deletion removes them by FK
-- cascade, which removes these rows the same way. The one other delete is the
-- hand removal of a fake daily (daily-suspects.sql), which must be followed by
-- a re-run of this file. So the trigger only handles inserts. The check at the
-- bottom catches any drift.
--
-- Takes a lock on game_results for under a second while it rebuilds: saves
-- wait, reads continue. It gives up (and changes nothing) if it cannot get the
-- lock within 2 s or the rebuild runs past 5 s in total, inside the 8 s request
-- limit.

begin;

-- The foreign keys lock auth.users briefly; never queue sign-ups behind this.
set local lock_timeout = '2s';

create table if not exists public.player_alltime_totals (
    user_id uuid primary key references auth.users (id) on delete cascade,
    games bigint not null,
    wins bigint not null,
    points bigint not null
);

-- One row per player per UTC day played; each day is worth 25 points once.
create table if not exists public.player_play_days (
    user_id uuid not null references auth.users (id) on delete cascade,
    day date not null,
    -- The biggest points_multiplier among that day's games (announcements.sql).
    multiplier smallint not null default 1,
    primary key (user_id, day)
);

alter table public.player_play_days add column if not exists multiplier smallint not null default 1;
-- Stamped per game by announcements.sql; 1 outside a points announcement.
alter table public.game_results add column if not exists points_multiplier smallint not null default 1;

alter table public.player_alltime_totals enable row level security;
alter table public.player_play_days enable row level security;
revoke all on table public.player_alltime_totals, public.player_play_days from anon, authenticated;

commit;

begin;

set local lock_timeout = '2s';
-- Bounds the whole rebuild, so saves queued behind the lock never wait past 5 s
-- (Postgres 17+; a per-statement timeout would let five steps add up).
set local transaction_timeout = '5s';

-- Replaced in the same transaction as the rebuild, so a rebuild that gives up
-- never leaves new weights adding onto totals built with the old ones.
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

-- A trigger function; nobody should be able to call it over the API.
revoke execute on function public.add_game_to_alltime_totals() from public, anon, authenticated;

lock table public.game_results in share row exclusive mode;

-- delete, not truncate: boards reading during a re-run keep the old totals until commit.
delete from public.player_alltime_totals;
delete from public.player_play_days;

insert into public.player_play_days (user_id, day, multiplier)
select user_id, (played_at at time zone 'UTC')::date, max(points_multiplier)
from public.game_results
where played_at is not null
group by 1, 2;

insert into public.player_alltime_totals (user_id, games, wins, points)
select g.user_id, g.games, g.wins, g.points + 25 * coalesce(d.days, 0)
from (
    select
        user_id,
        count(*) as games,
        count(*) filter (where result = 'won') as wins,
        sum(
            (
                case when (is_bot_game or cards_played_total >= 5) then
                    case result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
                else 0 end
                -- The stat columns are NOT NULL, so no coalesce is needed here or in the trigger.
                + draw_cards_played * 2
                + biggest_stack_survived * 3
                + uno_calls * 4
            ) * points_multiplier
        ) as points
    from public.game_results
    group by user_id
) g
left join (
    select user_id, sum(multiplier) as days from public.player_play_days group by user_id
) d using (user_id);

create or replace trigger game_results_alltime_totals
after insert on public.game_results
for each row execute function public.add_game_to_alltime_totals();

commit;

-- Check (read-only, run any time): compares the totals with a fresh
-- aggregate written the way player_points does it. Expect players equal and
-- mismatches = 0.
--
-- with per_day as (
--     select
--         gr.user_id,
--         count(*) as games,
--         count(*) filter (where gr.result = 'won') as wins,
--         sum(
--             (
--                 case when (gr.is_bot_game or gr.cards_played_total >= 5) then
--                     case gr.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
--                 else 0 end
--                 + gr.draw_cards_played * 2
--                 + gr.biggest_stack_survived * 3
--                 + gr.uno_calls * 4
--             ) * gr.points_multiplier
--         ) + 25 * max(gr.points_multiplier) as points
--     from public.game_results gr
--     group by gr.user_id, (gr.played_at at time zone 'UTC')::date
-- ),
-- fresh as (
--     select user_id, sum(games) as games, sum(wins) as wins, sum(points)::bigint as points
--     from per_day
--     group by user_id
-- )
-- select
--     (select count(*) from fresh) as players,
--     (select count(*) from public.player_alltime_totals) as totals,
--     (select count(*) from fresh f full join public.player_alltime_totals t using (user_id)
--      where (f.games, f.wins, f.points) is distinct from (t.games, t.wins, t.points)) as mismatches;
