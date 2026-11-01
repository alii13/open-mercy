-- Profile pictures. Run in the Supabase SQL Editor. Additive and re-runnable.
--
-- A photo is two things: profiles.avatar_version (epoch ms of the current
-- photo, null = none) and the object avatars/<user id>/<version> in a public
-- bucket. A new photo is a new object, so its url changes with it and the CDN
-- can cache it forever; the client deletes the previous object after a save.
--
-- profiles is already readable by everyone and updatable by its owner, so the
-- column needs no policy. Guests could set the column on their own row, but
-- without an object behind it every client falls back to the initial.

alter table public.profiles
    add column if not exists avatar_version bigint;

-- Small squares only: the client crops and re-encodes to 256px before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 262144, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- Claimed accounts write inside their own folder. Anonymous (guest) sessions
-- are refused here, which is the real gate; the app's claim sheet only
-- explains it. A guest who claims keeps their user id, so the folder is theirs.
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );

-- Storage's remove() needs select as well as delete on the rows it removes.
-- Scoped to your own folder; public reads go through the public url, not RLS.
drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
    for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
