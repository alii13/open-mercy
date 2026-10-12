-- Invite status for the host. Run in the Supabase SQL Editor AFTER invites.sql.
-- Additive: one SECURITY DEFINER read. Re-runnable.
--
-- room_invites is readable only by its receiver (room_invites_read_own), and
-- widening that for the sender would be a second RLS exception. A definer
-- function instead returns exactly what the waiting room needs: the caller's
-- own invites for the room they are hosting, latest per person, and only the
-- two timestamps the status is built from.

create or replace function public.my_sent_invites(p_code text)
returns table (
    to_user uuid,
    created_at timestamptz,
    seen_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select distinct on (i.to_user) i.to_user, i.created_at, i.seen_at
    from room_invites i
    where i.from_user = auth.uid()
      and i.room_code = p_code
      and i.created_at > now() - interval '30 minutes'
    order by i.to_user, i.created_at desc
$$;

revoke execute on function public.my_sent_invites(text) from public, anon;
grant execute on function public.my_sent_invites(text) to authenticated;
