-- All-time global rank for the players at a public table (the 3D lounge
-- cards). Run in the Supabase SQL Editor after leaderboards-alltime.sql.
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
        select
            gr.user_id,
            count(*) as games,
            (
                count(*) filter (where gr.result = 'won' and gr.cards_played_total >= 5) * 100
              + count(*) filter (where gr.result in ('lost', 'eliminated') and gr.cards_played_total >= 5) * 12
              + coalesce(sum(gr.draw_cards_played), 0) * 2
              + coalesce(sum(gr.biggest_stack_survived), 0) * 3
              + coalesce(sum(gr.uno_calls), 0) * 4
              + count(distinct (gr.played_at at time zone 'UTC')::date) * 25
            )::bigint as points
        from game_results gr
        group by gr.user_id
    ),
    ranked as (
        select user_id, row_number() over (order by points desc, games asc) as rnk
        from scored
    )
    select r.user_id, r.rnk
    from ranked r
    where r.user_id = any(ids[1:20]);
$$;

grant execute on function public.alltime_ranks(uuid[]) to anon, authenticated;
