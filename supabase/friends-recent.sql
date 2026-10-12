-- Played recently: the people a friend request is most likely to land with.
-- Run in the Supabase SQL Editor AFTER friends.sql and presence.sql.
-- Additive: one SECURITY DEFINER read. Re-runnable.
--
-- Multiplayer results share a game_id across the table, so the people you
-- played are the other user_ids on your game_ids. Bot games are skipped (no
-- one to add), and so is anyone you already have a friendships row with in
-- either direction - friend, pending, declined or blocked - so the list never
-- offers ADD to someone it should not.
--
-- game_results is owner-select-only (CLAUDE.md), which is why this is a
-- definer function rather than a client query: it reads other players' rows
-- for the shared games and returns only names and a head-to-head count.

create or replace function public.recent_opponents()
returns table (
    user_id uuid,
    username text,
    share_code text,
    last_seen_at timestamptz,
    games int,
    my_wins int,
    their_wins int,
    last_played timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    with mine as (
        select game_id, result
        from game_results
        where user_id = auth.uid()
          and not is_bot_game
          and played_at > now() - interval '7 days'
    ),
    them as (
        select g.user_id, g.result as their_result, m.result as my_result, g.played_at
        from game_results g
        join mine m on m.game_id = g.game_id
        where g.user_id <> auth.uid()
          and not g.is_bot_game
    )
    select
        t.user_id,
        p.username,
        p.share_code,
        p.last_seen_at,
        count(*)::int as games,
        count(*) filter (where t.my_result = 'won')::int as my_wins,
        count(*) filter (where t.their_result = 'won')::int as their_wins,
        max(t.played_at) as last_played
    from them t
    join profiles p on p.id = t.user_id
    where not exists (
        select 1 from friendships f
        where (f.requester_id = auth.uid() and f.addressee_id = t.user_id)
           or (f.requester_id = t.user_id and f.addressee_id = auth.uid())
    )
    group by t.user_id, p.username, p.share_code, p.last_seen_at
    order by max(t.played_at) desc
    limit 5
$$;

revoke execute on function public.recent_opponents() from public, anon;
grant execute on function public.recent_opponents() to authenticated;
