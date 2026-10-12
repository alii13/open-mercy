-- Ranks 11-20 for the public profile's promotion timeline. Run in the
-- Supabase SQL Editor AFTER profile-dossier.sql. Re-runnable: it only
-- replaces profile_promotions, whose ladder must match badges.ts BADGES
-- (profile-dossier.sql carries the same rows for a fresh install).

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
            gr.cards_played_total,
            gr.draw_cards_played,
            gr.biggest_stack_survived,
            gr.uno_calls,
            case
                when row_number() over (
                    partition by (gr.played_at at time zone 'UTC')::date
                    order by gr.played_at
                ) = 1 then 1 else 0
            end as new_day
        from game_results gr
        join target t on gr.user_id = t.id
    ),
    running as (
        select
            played_at,
            (
                sum(case when result = 'won' and cards_played_total >= 5 then 1 else 0 end) over w * 100
              + sum(case when result in ('lost', 'eliminated') and cards_played_total >= 5 then 1 else 0 end) over w * 12
              + sum(draw_cards_played) over w * 2
              + sum(biggest_stack_survived) over w * 3
              + sum(uno_calls) over w * 4
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

grant execute on function public.profile_promotions to anon, authenticated;
