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
-- game_results rows are never updated, and are only deleted when an account is
-- deleted (FK cascade), which removes these rows the same way. So the trigger
-- only handles inserts. The check at the bottom catches any drift.
--
-- Takes a lock on game_results for under a second while it rebuilds: saves
-- wait, reads continue. It gives up (and changes nothing) if it cannot get the
-- lock within 2 s or a step runs past 5 s, well inside the 8 s request limit.

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
    primary key (user_id, day)
);

alter table public.player_alltime_totals enable row level security;
alter table public.player_play_days enable row level security;
revoke all on table public.player_alltime_totals, public.player_play_days from anon, authenticated;

create or replace function public.add_game_to_alltime_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_days integer := 0;
begin
    if new.played_at is not null then
        insert into player_play_days (user_id, day)
        values (new.user_id, (new.played_at at time zone 'UTC')::date)
        on conflict do nothing;
        get diagnostics new_days = row_count;
    end if;

    insert into player_alltime_totals as t (user_id, games, wins, points)
    values (
        new.user_id,
        1,
        (new.result = 'won')::int,
        case when new.is_bot_game or new.cards_played_total >= 5 then
            case new.result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
        else 0 end
        + new.draw_cards_played * 2
        + new.biggest_stack_survived * 3
        + new.uno_calls * 4
        + new_days * 25
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

commit;

begin;

set local lock_timeout = '2s';
set local statement_timeout = '5s';

lock table public.game_results in share row exclusive mode;

-- delete, not truncate: boards reading during a re-run keep the old totals until commit.
delete from public.player_alltime_totals;
delete from public.player_play_days;

insert into public.player_play_days (user_id, day)
select user_id, (played_at at time zone 'UTC')::date
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
            case when is_bot_game or cards_played_total >= 5 then
                case result when 'won' then 100 when 'lost' then 12 when 'eliminated' then 12 else 0 end
            else 0 end
            + draw_cards_played * 2
            + biggest_stack_survived * 3
            + uno_calls * 4
        ) as points
    from public.game_results
    group by user_id
) g
left join (
    select user_id, count(*) as days from public.player_play_days group by user_id
) d using (user_id);

create or replace trigger game_results_alltime_totals
after insert on public.game_results
for each row execute function public.add_game_to_alltime_totals();

commit;

-- Check (read-only, run any time): compares the totals with a fresh
-- aggregate written the old way. Expect players equal and mismatches = 0.
--
-- with fresh as (
--     select
--         gr.user_id,
--         count(*) as games,
--         count(*) filter (where gr.result = 'won') as wins,
--         (
--             count(*) filter (where gr.result = 'won' and (gr.is_bot_game or gr.cards_played_total >= 5)) * 100
--           + count(*) filter (where gr.result in ('lost', 'eliminated') and (gr.is_bot_game or gr.cards_played_total >= 5)) * 12
--           + coalesce(sum(gr.draw_cards_played), 0) * 2
--           + coalesce(sum(gr.biggest_stack_survived), 0) * 3
--           + coalesce(sum(gr.uno_calls), 0) * 4
--           + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
--         )::bigint as points
--     from public.game_results gr
--     group by gr.user_id
-- )
-- select
--     (select count(*) from fresh) as players,
--     (select count(*) from public.player_alltime_totals) as totals,
--     (select count(*) from fresh f full join public.player_alltime_totals t using (user_id)
--      where (f.games, f.wins, f.points) is distinct from (t.games, t.wins, t.points)) as mismatches;
