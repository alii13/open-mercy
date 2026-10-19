-- Site pulse. Run in the Supabase SQL Editor. Additive: one index, one
-- SECURITY DEFINER function, one grant. Re-running the file is safe.
--
-- The landing page shows "733 PLAYERS · 5,544 GAMES THIS WEEK" to a cold
-- visitor, who otherwise has no way to tell whether anyone plays here. A
-- week is the window because it is always a big number: the live count in
-- the lobby (online_now) is honest about a quiet hour, and that honesty is
-- what sends a first-time visitor away. The client hides the line under a
-- floor, see frontend/src/composables/useSitePulse.ts.
--
-- What this exposes: two aggregate counts, no identities. Games are distinct
-- game ids, so a four-seat table counts once, not four times.

create index if not exists game_results_played_at_idx on game_results (played_at desc);

create or replace function public.site_pulse()
returns table (players_7d int, games_7d int)
language sql
security definer
set search_path = public
stable
as $$
    select count(distinct user_id)::int, count(distinct game_id)::int
    from game_results
    where played_at > now() - interval '7 days'
$$;

grant execute on function public.site_pulse to anon, authenticated;
