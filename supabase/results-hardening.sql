-- Results and profiles hardening. Run in the Supabase SQL Editor in TWO steps.
--
-- STEP 1 (run now, before the frontend deploy): additive and safe for the
-- live client. Creates the result-recording function, narrows what a player
-- can write on their own profile, and pins three function search paths.
--
-- STEP 2 (run after the frontend that calls record_bot_result is live):
-- removes the direct insert on game_results. Until step 2 the old insert
-- path still works, so an old cached tab keeps logging results.
--
-- Why: a player could POST straight to /rest/v1/game_results with any
-- numbers, backdate played_at, and take #1 on every board and the top badge.
-- The browser still reports its own solo games (there is no server for them),
-- but now through one function that owns user_id, played_at and is_bot_game,
-- clamps every stat to what real games produce, and caps how many results a
-- player can file per 10 minutes so a script can't flood the boards.

-- ============================== STEP 1 ==============================

create or replace function public.record_bot_result(
    p_game_id text,
    p_result text,
    p_opponent_count int,
    p_cards_remaining int,
    p_peak_cards int,
    p_draw_cards_played int,
    p_wild_cards_played int,
    p_cards_played_total int,
    p_skips_dealt int,
    p_swaps_made int,
    p_draws_taken int,
    p_biggest_stack_survived int,
    p_uno_calls int,
    p_uno_penalties int,
    p_game_duration_secs int
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
    daily_date date;
begin
    if me is null then return 'unauthorized'; end if;
    if p_result not in ('won', 'lost', 'eliminated') then return 'bad_result'; end if;
    if p_game_id !~ '^(bot-[0-9]{10,16}|daily-[0-9]{4}-[0-9]{2}-[0-9]{2})$' then return 'bad_game'; end if;

    -- A daily can only be filed for today, give or take a timezone.
    if p_game_id like 'daily-%' then
        daily_date := substr(p_game_id, 7)::date;
        if daily_date not between (now() at time zone 'utc')::date - 1
                              and (now() at time zone 'utc')::date + 1 then
            return 'bad_game';
        end if;
    end if;

    -- ponytail: at most 40 results per player per 10 minutes. Real players
    -- peak at 36 (99.9th percentile over 30 days); a script is capped at
    -- 4 fake results a minute. Spacing results out instead would drop real
    -- ones: 10% arrive under 10s apart. A replay check of the daily's turn
    -- log is the upgrade if that matters.
    if (
        select count(*) from game_results
        where user_id = me and is_bot_game
          and played_at > now() - interval '10 minutes'
    ) >= 40 then return 'too_soon'; end if;

    -- Ceilings sit well above anything a real game has produced (max seen:
    -- 100 cards played, 25 draw cards, 46-card stack survived).
    insert into game_results (
        game_id, user_id, opponent_count, result, cards_remaining, peak_cards,
        draw_cards_played, wild_cards_played, cards_played_total, skips_dealt,
        swaps_made, draws_taken, biggest_stack_survived, uno_calls,
        uno_penalties, game_duration_secs, is_bot_game, played_at
    ) values (
        p_game_id, me,
        least(greatest(coalesce(p_opponent_count, 1), 1), 9),
        p_result,
        least(greatest(coalesce(p_cards_remaining, 0), 0), 25),
        least(greatest(coalesce(p_peak_cards, 0), 0), 25),
        least(greatest(coalesce(p_draw_cards_played, 0), 0), 60),
        least(greatest(coalesce(p_wild_cards_played, 0), 0), 60),
        least(greatest(coalesce(p_cards_played_total, 0), 0), 200),
        least(greatest(coalesce(p_skips_dealt, 0), 0), 60),
        least(greatest(coalesce(p_swaps_made, 0), 0), 30),
        least(greatest(coalesce(p_draws_taken, 0), 0), 200),
        least(greatest(coalesce(p_biggest_stack_survived, 0), 0), 100),
        least(greatest(coalesce(p_uno_calls, 0), 0), 50),
        least(greatest(coalesce(p_uno_penalties, 0), 0), 20),
        least(greatest(coalesce(p_game_duration_secs, 0), 0), 6 * 3600),
        true, now()
    );
    return 'ok';
exception
    -- The daily's one-attempt unique index.
    when unique_violation then return 'duplicate';
end;
$$;

revoke execute on function public.record_bot_result from public, anon;
grant execute on function public.record_bot_result to authenticated;

-- A player may write only their name, country and card back. share_code,
-- games_played, games_won, last_seen_at and created_at are no longer
-- writable from the browser (last_seen_at goes through touch_presence).
-- id stays in the column list because the client upserts on id; RLS still
-- pins it to auth.uid().
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id, username) on public.profiles to authenticated;
grant update (id, username, country, equipped_card_back) on public.profiles to authenticated;

-- not valid: checks every new write without failing on an old row.
alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles add constraint profiles_username_shape
    check (char_length(username) between 1 and 40 and username !~ '[[:cntrl:]]') not valid;
alter table public.profiles drop constraint if exists profiles_country_shape;
alter table public.profiles add constraint profiles_country_shape
    check (country is null or country ~ '^[A-Z]{2}$') not valid;
alter table public.profiles drop constraint if exists profiles_card_back_shape;
alter table public.profiles add constraint profiles_card_back_shape
    check (equipped_card_back is null or char_length(equipped_card_back) <= 32) not valid;

-- Database linter: search_path was not pinned on these three.
alter function public.commit_move(uuid, integer, jsonb, jsonb) set search_path = public, pg_temp;
alter function public.generate_room_code() set search_path = public, pg_temp;
alter function public.update_updated_at() set search_path = public, pg_temp;

-- A trigger function; nobody should be able to call it over the API.
revoke execute on function public.create_profile_for_user() from public, anon, authenticated;

-- ============================== STEP 2 ==============================
-- Run after the frontend that calls record_bot_result has deployed.
--
-- revoke insert on public.game_results from anon, authenticated;
-- drop policy if exists "Users can insert own results" on public.game_results;
