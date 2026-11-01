-- ORBIT GAME RECORDINGS. Run once in the ORBIT Supabase project (qtmrtxgkisshdtqshjre): SQL Editor > New query > paste > Run. Safe to re-run.
-- Why: Orbit Games no longer asks for a separate Google login. Recordings are saved with the Orbit account that is already signed in,
-- so the clips and the library now live in the Orbit project (before, they lived in the games project and needed Google).
-- Adds: a public "recordings" storage bucket where every player has a folder named after their Orbit account id, and a
-- "recordings" table (the player's library). The per-player limit shown in the games admin (Settings > recordings_max) is applied
-- by the games page; the database keeps a hard cap of 50 clips per player as a backstop.

-- 1. storage bucket: video only, 50 MB max per clip (20 minutes). Public so a copied link plays for anyone who has it;
--    file names are random and every file sits in a folder named after the player's account id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', true, 52428800, array['video/webm', 'video/mp4'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['video/webm', 'video/mp4'];

-- signed-in players may add and delete files only inside their own folder (<account id>/<random>.webm|mp4)
drop policy if exists rec_obj_insert on storage.objects;
create policy rec_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webm|mp4)$');
drop policy if exists rec_obj_delete on storage.objects;
create policy rec_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2. the library
create table if not exists public.recordings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 12),
  game text not null check (game ~ '^[a-z0-9]{1,16}$'),
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webm|mp4)$'),
  secs int not null check (secs between 1 and 1200),
  bytes bigint not null check (bytes between 1 and 52428800),
  score int check (score is null or score between 0 and 10000000),
  created_at timestamptz not null default now());
create index if not exists recordings_user_idx on public.recordings(user_id, id desc);

alter table public.recordings enable row level security;
drop policy if exists rec_sel on public.recordings;
create policy rec_sel on public.recordings for select to authenticated using (user_id = auth.uid());
drop policy if exists rec_ins on public.recordings;
create policy rec_ins on public.recordings for insert to authenticated
  with check (user_id = auth.uid() and split_part(path, '/', 1) = auth.uid()::text);
drop policy if exists rec_del on public.recordings;
create policy rec_del on public.recordings for delete to authenticated using (user_id = auth.uid());
revoke all on public.recordings from anon;
revoke update, truncate on public.recordings from authenticated;
grant select, insert, delete on public.recordings to authenticated;

-- 3. rules checked on every new clip: the file really uploaded, and the hard cap
create or replace function public.rec_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from storage.objects where bucket_id = 'recordings' and name = new.path) then
    raise exception 'That recording did not upload. Try again.'; end if;
  select count(*) into n from public.recordings where user_id = new.user_id;
  if n >= 50 then raise exception 'You already have 50 recordings saved. Delete one to save a new one.'; end if;
  new.name := btrim(new.name);
  return new;
end $$;
drop trigger if exists rec_rules_trg on public.recordings;
create trigger rec_rules_trg before insert on public.recordings for each row execute function public.rec_rules();
