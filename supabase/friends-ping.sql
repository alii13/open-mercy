-- Pings: "I want to play" to a friend who is not online right now.
-- Run in the Supabase SQL Editor AFTER friends.sql. Additive: one table, one
-- policy, three SECURITY DEFINER functions, one publication change.
-- Re-runnable.
--
-- A room invite is useless to someone offline: it lives ten minutes and points
-- at a room that will be gone. A ping carries no room. It says who wants to
-- play, and the receiver answers it whenever they come back by opening a room
-- of their own and inviting the pinger.
--
-- Same shape as room_invites: the receiver can read their own rows so
-- Realtime can deliver them, and writes go only through send_ping, where the
-- limits live. Friends only - unlike invites, a ping reaches someone who is
-- not looking at the game, so it must come from someone they chose.

create table if not exists pings (
    id uuid primary key default gen_random_uuid(),
    from_user uuid not null references auth.users(id) on delete cascade,
    to_user uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    -- Set when the receiver answers or waves it away.
    seen_at timestamptz
);

create index if not exists pings_to_idx on pings (to_user, created_at desc);
create index if not exists pings_from_idx on pings (from_user, created_at desc);

alter table pings enable row level security;

drop policy if exists pings_read_own on pings;
create policy pings_read_own on pings
    for select using (to_user = auth.uid());

do $$
begin
    alter publication supabase_realtime add table pings;
exception when duplicate_object then null;
end;
$$;

-- --- Write ------------------------------------------------------------------

-- Returns: sent, self, not_friends, too_soon, rate_limited, unauthorized.

create or replace function public.send_ping(p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
    today int;
begin
    if me is null then return 'unauthorized'; end if;
    if p_user is null or p_user = me then return 'self'; end if;

    if not exists (
        select 1 from friendships
        where status = 'accepted'
          and least(requester_id, addressee_id) = least(me, p_user)
          and greatest(requester_id, addressee_id) = greatest(me, p_user)
    ) then return 'not_friends'; end if;

    -- One per friend per six hours: enough to say "I'm around tonight",
    -- not enough to nag.
    if exists (
        select 1 from pings
        where from_user = me and to_user = p_user
          and created_at > now() - interval '6 hours'
    ) then return 'too_soon'; end if;

    select count(*) into today from pings
    where from_user = me and created_at > now() - interval '1 day';
    if today >= 10 then return 'rate_limited'; end if;

    -- Nothing reads a ping older than a day.
    delete from pings where created_at < now() - interval '2 days';

    insert into pings (from_user, to_user) values (me, p_user);
    return 'sent';
end;
$$;

revoke execute on function public.send_ping(uuid) from public, anon;
grant execute on function public.send_ping(uuid) to authenticated;

-- --- Reads ------------------------------------------------------------------

-- Pings worth answering: mine, unanswered, from someone who is still a
-- friend, and from today. Yesterday's "want to play?" is not an offer any
-- more.

create or replace function public.my_pings()
returns table (
    id uuid,
    from_user uuid,
    from_username text,
    created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select g.id, g.from_user, p.username, g.created_at
    from pings g
    join profiles p on p.id = g.from_user
    where g.to_user = auth.uid()
      and g.seen_at is null
      and g.created_at > now() - interval '1 day'
      and exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and least(f.requester_id, f.addressee_id) = least(g.from_user, g.to_user)
          and greatest(f.requester_id, f.addressee_id) = greatest(g.from_user, g.to_user)
      )
    order by g.created_at desc
$$;

revoke execute on function public.my_pings() from public, anon;
grant execute on function public.my_pings() to authenticated;

-- Who I pinged in the last six hours, so the button can say "Pinged" and
-- stay honest after a reload.

create or replace function public.my_sent_pings()
returns table (to_user uuid, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
    select distinct on (g.to_user) g.to_user, g.created_at
    from pings g
    where g.from_user = auth.uid()
      and g.created_at > now() - interval '6 hours'
    order by g.to_user, g.created_at desc
$$;

revoke execute on function public.my_sent_pings() from public, anon;
grant execute on function public.my_sent_pings() to authenticated;

create or replace function public.dismiss_ping(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then return 'unauthorized'; end if;
    update pings set seen_at = now()
    where id = p_id and to_user = me and seen_at is null;
    if not found then return 'not_found'; end if;
    return 'dismissed';
end;
$$;

revoke execute on function public.dismiss_ping(uuid) from public, anon;
grant execute on function public.dismiss_ping(uuid) to authenticated;
