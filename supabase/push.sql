-- Daily reminders (game-server/src/push.ts).
--
-- One row per browser that said yes to reminders, keyed by its push endpoint.
-- The streak columns are a copy of what the browser keeps (retentionStore), so
-- the hourly sender can say something true without asking the browser.
--
-- RLS is on with no policies: only the game server, holding the service key,
-- reads or writes it. Additive only. Run BEFORE deploying the game server;
-- until then subscribing answers 502 and the hourly run logs a failed read.

create table if not exists public.push_subscriptions (
    endpoint text primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    p256dh text not null,
    auth text not null,
    tz text not null,
    play_hour smallint not null check (play_hour between 0 and 23),
    streak integer not null default 0,
    last_played date,
    shield_used_on date,
    last_sent_on date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_last_played_idx on public.push_subscriptions (last_played);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Today's daily deal so far, for the "Only 12 of 52 beat today's deal" wording.
-- Counts only; the game server calls it with the service key.
create or replace function public.push_daily_stats(p_game_id text)
returns table (players bigint, won bigint)
language sql
stable
security definer
set search_path = public
as $$
    select count(*), count(*) filter (where result = 'won')
    from public.game_results
    where game_id = p_game_id
$$;
revoke all on function public.push_daily_stats(text) from public, anon, authenticated;
grant execute on function public.push_daily_stats(text) to service_role;

-- Reminders sent per wording per UTC day. Taps per wording are the GA event
-- reminder_opened (parameter `variant`); the two together are the click rate.
create table if not exists public.push_sends (
    day date not null,
    variant text not null,
    sent integer not null default 0,
    primary key (day, variant)
);
alter table public.push_sends enable row level security;
revoke all on public.push_sends from anon, authenticated;

create or replace function public.push_count_sends(p_day date, p_counts jsonb)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.push_sends (day, variant, sent)
    select p_day, key, value::int from jsonb_each_text(p_counts)
    on conflict (day, variant) do update set sent = public.push_sends.sent + excluded.sent
$$;
revoke all on function public.push_count_sends(date, jsonb) from public, anon, authenticated;
grant execute on function public.push_count_sends(date, jsonb) to service_role;

-- How it is doing (read in the SQL Editor):
-- select count(*) as subscribers,
--        count(*) filter (where last_sent_on >= current_date - 7) as reminded_this_week
-- from public.push_subscriptions;
--
-- select variant, sum(sent) as sent from public.push_sends
-- where day >= current_date - 7 group by variant order by sent desc;
