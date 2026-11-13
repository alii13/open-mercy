-- Reporting a player from the table: tap their seat in a multiplayer game.
-- App Review requires a way to report other players in an app where strangers
-- talk to each other (guideline 1.2), and the public table has voice chat.
--
-- Run once in the SQL Editor. Additive only. Until it runs, the report dialog
-- says it could not send.

create table if not exists public.player_reports (
    id bigint generated always as identity primary key,
    reporter_id uuid not null references auth.users (id) on delete cascade,
    -- No foreign key: a report outlives the reported account, so the
    -- moderator can still see who was reported for what.
    reported_id uuid not null,
    reason text not null check (reason in ('voice', 'name_or_photo', 'cheating', 'other')),
    room_code text,
    created_at timestamptz not null default now(),
    unique (reporter_id, reported_id, room_code)
);

-- No policies: players write through report_player, and only the SQL Editor reads.
alter table public.player_reports enable row level security;

create or replace function public.report_player(p_user uuid, p_reason text, p_room text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then return 'unauthorized'; end if;
    if p_user is null or p_user = me then return 'self'; end if;
    if p_reason is null or p_reason not in ('voice', 'name_or_photo', 'cheating', 'other') then
        return 'bad_reason';
    end if;

    -- One report per player per room: tapping REPORT twice is not two reports.
    insert into player_reports (reporter_id, reported_id, reason, room_code)
    values (me, p_user, p_reason, left(p_room, 16))
    on conflict (reporter_id, reported_id, room_code) do nothing;
    return 'reported';
end;
$$;

revoke execute on function public.report_player(uuid, text, text) from public, anon;
grant execute on function public.report_player(uuid, text, text) to authenticated;

-- Reading the reports, newest first:
--
-- select r.created_at, r.reason, r.room_code,
--        reporter.username as reporter, reported.username as reported, r.reported_id
-- from player_reports r
-- left join profiles reporter on reporter.id = r.reporter_id
-- left join profiles reported on reported.id = r.reported_id
-- order by r.created_at desc;
