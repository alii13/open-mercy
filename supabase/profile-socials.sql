-- X and Instagram handles on the public profile (/p/<share_code>). Run in the
-- Supabase SQL Editor. Additive and re-runnable.
--
-- Only the bare handle is stored, never a url. The client builds each link
-- from a fixed origin (https://x.com/<handle>, https://www.instagram.com/<handle>/),
-- and the checks below keep a handle to the characters each network allows, so
-- a saved handle can only ever link to that network.
--
-- profiles is readable by everyone and updatable by its owner, so the columns
-- need no policy and no read grant.

alter table public.profiles
    add column if not exists x_handle text,
    add column if not exists instagram_handle text;

-- X: 1 to 15 letters, digits or underscores.
alter table public.profiles drop constraint if exists profiles_x_handle_format;
alter table public.profiles add constraint profiles_x_handle_format
    check (x_handle ~ '^[A-Za-z0-9_]{1,15}$');

-- Instagram: 1 to 30 letters, digits, underscores or dots, with no dot at
-- either end and no two dots in a row.
alter table public.profiles drop constraint if exists profiles_instagram_handle_format;
alter table public.profiles add constraint profiles_instagram_handle_format
    check (
        instagram_handle ~ '^[A-Za-z0-9_]([A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$'
        and instagram_handle !~ '\.\.'
    );

-- results-hardening.sql grants profile updates column by column, so a new
-- column is read-only until it is listed. Without this the save fails with
-- "permission denied for table profiles".
grant update (x_handle, instagram_handle) on public.profiles to authenticated;
