-- Photo versions for a batch of players, at one fixed address. Run in the
-- Supabase SQL Editor after avatars.sql. Additive and re-runnable.
--
-- The client read these with GET /profiles?id=in.(...). A browser caches a
-- CORS preflight per URL, and every batch of ids is a new URL, so about three
-- in four of those reads paid an extra OPTIONS request (edge logs, 2026-11-10:
-- 1,648 OPTIONS for 2,191 GETs). An rpc is one URL, so its preflight is cached.
-- Until this runs the client keeps using the GET.
--
-- profiles is already readable by everyone, so this runs as the caller and
-- returns nothing the table read does not.

create or replace function public.avatar_versions(ids uuid[])
returns table (id uuid, avatar_version bigint)
language sql
stable
set search_path = public
as $$
    select p.id, p.avatar_version from profiles p where p.id = any(ids);
$$;

grant execute on function public.avatar_versions(uuid[]) to anon, authenticated;
