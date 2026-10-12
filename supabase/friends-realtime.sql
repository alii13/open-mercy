-- Live friend requests. Run in the Supabase SQL Editor AFTER friends.sql.
-- Additive: one policy, one publication change. Re-runnable.
--
-- Realtime delivers postgres_changes through RLS, so a row nobody may SELECT
-- never reaches a subscriber - which is why friend requests only ever showed
-- up on a lobby reload. The client treats each event as a nudge to call
-- my_friends again; the payload itself is not rendered.
--
-- The policy is deliberately narrow: exactly the two rows the live surfaces
-- need, nothing else.
--   * a pending request addressed to me (the request toast)
--   * a request I sent, once it is accepted (the "accepted" toast)
-- A declined row stays invisible to its sender, so a refusal is silent, and a
-- blocked row is invisible to both sides, so blocked_by never leaks. Writes
-- still have no policy: they go through the SECURITY DEFINER functions.

drop policy if exists friendships_read_live on friendships;
create policy friendships_read_live on friendships
    for select using (
        (addressee_id = auth.uid() and status = 'pending')
        or (requester_id = auth.uid() and status = 'accepted')
    );

-- Adding a table twice raises, so the guard keeps this file re-runnable.
do $$
begin
    alter publication supabase_realtime add table friendships;
exception when duplicate_object then null;
end;
$$;
