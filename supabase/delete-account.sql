-- Account deletion. Run in the Supabase SQL Editor. Additive and re-runnable.
--
-- A signed-in player (guests included) deletes their own account and
-- everything tied to it. Apple requires this inside any app that creates
-- accounts, and the iOS app is a wrapper of this site.
--
-- Deleting the auth.users row cascades to profiles, game_results,
-- friendships, room_invites, poll_votes, pings and push_subscriptions. The
-- function clears what the cascade does not reach first:
--   - feedback and kill_cards set user_id to null on delete; the owner chose
--     "delete everything", so their rows go too.
--   - the retired broadcast-era tables games and game_players reference
--     profiles with no ON DELETE action, so a player with old rows there would
--     make the delete fail. Their game_players rows and the games they hosted
--     go (game_players cascades from games); games they only won or were
--     mid-turn in keep the row with that column cleared.
--
-- The profile photo lives in Storage, which SQL may not delete from; the
-- client clears avatars/<user id>/ before calling this.
--
-- dry_run => true checks the function exists and the caller is signed in,
-- touching nothing. The client calls it first so the photo is never removed
-- on a project where this file has not been run yet.

create or replace function public.delete_my_account(dry_run boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then
        raise exception 'not signed in' using errcode = '42501';
    end if;
    if dry_run then
        return;
    end if;

    delete from public.game_players where user_id = me;
    delete from public.games where host_id = me;
    update public.games set winner_id = null where winner_id = me;
    update public.games set current_player_id = null where current_player_id = me;

    delete from public.feedback where user_id = me;
    delete from public.kill_cards where user_id = me;

    delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
