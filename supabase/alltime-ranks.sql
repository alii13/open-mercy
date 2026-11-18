-- All-time global rank for the players at a public table (the 3D lounge
-- cards). Run in the Supabase SQL Editor after leaderboards-alltime.sql and
-- alltime-score-totals.sql (it reads player_alltime_totals).
-- Additive only: one SECURITY DEFINER function + grant.
--
-- Same scoring and ordering as alltime_my_rank(), so a card's rank matches
-- the leaderboard. Exposes nothing but the rank of explicitly requested ids,
-- at most 20 per call (a public table seats 7). An id with no games has no
-- row: the card reads UNRANKED.

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
