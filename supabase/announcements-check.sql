-- Smoke test for announcements.sql. Run it in the Supabase SQL Editor after
-- announcements.sql, before posting a real announcement. It changes nothing:
-- the test announcement, the test games and every total they touch roll back.
--
-- Expect the notice "announcements check passed". Any failed check stops with
-- its message instead.

begin;

do $$
declare
    p1 uuid;
    p2 uuid;
    stamped smallint;
    totals_before bigint;
    totals_after bigint;
    badge_before bigint;
    badge_after bigint;
    reply text;
    live record;
begin
    select id into p1 from auth.users order by created_at limit 1;
    select id into p2 from auth.users where id <> p1 order by created_at limit 1;

    insert into public.announcements (id, starts_at, ends_at, body, button_label, points_multiplier)
    values ('smoke-test', now() - interval '1 hour', now() + interval '1 hour', 'Smoke test', 'OK', 2);

    -- Player 2 skips twice, then cannot join.
    perform set_config('request.jwt.claims', json_build_object('sub', p2)::text, true);
    reply := public.answer_announcement('smoke-test', false);
    assert reply = 'skipped', 'first skip should count, got ' || reply;
    reply := public.answer_announcement('smoke-test', false);
    assert reply = 'skipped', 'second skip should count, got ' || reply;
    reply := public.answer_announcement('smoke-test', true);
    assert reply = 'closed', 'a join after two skips must be refused, got ' || reply;
    select * into live from public.live_announcement();
    assert live.id = 'smoke-test' and live.skips = 2 and not live.joined, 'live_announcement should show 2 skips, not joined';

    -- A player who did not join gets 1, whatever the saver sends.
    insert into public.game_results (
        game_id, user_id, opponent_count, result, cards_remaining, peak_cards,
        draw_cards_played, wild_cards_played, cards_played_total, skips_dealt,
        swaps_made, draws_taken, biggest_stack_survived, uno_calls,
        uno_penalties, game_duration_secs, is_bot_game, played_at, points_multiplier
    ) values ('bot-9999999999001', p2, 1, 'won', 0, 7, 0, 0, 10, 0, 0, 0, 0, 0, 0, 60, true, now(), 5)
    returning points_multiplier into stamped;
    assert stamped = 1, 'a player who did not join must get 1, got ' || stamped;

    -- Player 1 joins through the same function the button calls.
    perform set_config('request.jwt.claims', json_build_object('sub', p1)::text, true);
    reply := public.answer_announcement('smoke-test', true);
    assert reply = 'joined', 'join should succeed, got ' || reply;

    -- A game from before the window stays at 1.
    insert into public.game_results (
        game_id, user_id, opponent_count, result, cards_remaining, peak_cards,
        draw_cards_played, wild_cards_played, cards_played_total, skips_dealt,
        swaps_made, draws_taken, biggest_stack_survived, uno_calls,
        uno_penalties, game_duration_secs, is_bot_game, played_at
    ) values ('bot-9999999999002', p1, 1, 'won', 0, 7, 0, 0, 10, 0, 0, 0, 0, 0, 0, 60, true, now() - interval '2 hours')
    returning points_multiplier into stamped;
    assert stamped = 1, 'a game before the window must get 1, got ' || stamped;

    -- A loss today, also boosted: it brings today's 25 up to x2, so the next
    -- game's gain is only its own points.
    insert into public.game_results (
        game_id, user_id, opponent_count, result, cards_remaining, peak_cards,
        draw_cards_played, wild_cards_played, cards_played_total, skips_dealt,
        swaps_made, draws_taken, biggest_stack_survived, uno_calls,
        uno_penalties, game_duration_secs, is_bot_game, played_at
    ) values ('bot-9999999999003', p1, 1, 'lost', 3, 7, 0, 0, 10, 0, 0, 0, 0, 0, 0, 60, true, now());

    select points into totals_before from public.player_alltime_totals where user_id = p1;
    select points into badge_before from public.player_points(array[p1]);

    -- A boosted win.
    insert into public.game_results (
        game_id, user_id, opponent_count, result, cards_remaining, peak_cards,
        draw_cards_played, wild_cards_played, cards_played_total, skips_dealt,
        swaps_made, draws_taken, biggest_stack_survived, uno_calls,
        uno_penalties, game_duration_secs, is_bot_game, played_at
    ) values ('bot-9999999999004', p1, 1, 'won', 0, 7, 1, 0, 10, 0, 0, 0, 2, 1, 0, 60, true, now())
    returning points_multiplier into stamped;
    assert stamped = 2, 'a joined player inside the window must get 2, got ' || stamped;

    select points into totals_after from public.player_alltime_totals where user_id = p1;
    select points into badge_after from public.player_points(array[p1]);
    -- (100 win + 1 draw card x 2 + stack 2 x 3 + 1 UNO x 4) x 2 = 224
    assert totals_after - totals_before = 224, 'ranks should gain 224, got ' || (totals_after - totals_before);
    assert badge_after - badge_before = 224, 'badges should gain 224, got ' || (badge_after - badge_before);

    raise notice 'announcements check passed';
end;
$$;

rollback;
