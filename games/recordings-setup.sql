-- GAME RECORDINGS SETUP. Run once in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds: a "recordings" storage bucket where every signed-in player has their own folder, a "recordings" table
-- (the player's library), a limit per player, a "recording" chat message kind so clips can be shared in chat,
-- and on/off + limit switches in site_settings (recordings_enabled, recordings_max).
-- Needs chat-setup.sql, chat-images-setup.sql and admin-setup.sql to have been run first (it re-uses setting() and has_level()).

-- 1. storage bucket: video only, 50 MB max per clip (20 minutes). Public so a clip shared in chat plays for everyone;
--    file names are random and every file sits in a folder named after the player's account id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', true, 52428800, array['video/webm', 'video/mp4'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['video/webm', 'video/mp4'];

-- signed-in players may add and delete files only inside their own folder (<account id>/<random>.webm|mp4); mods may delete any
drop policy if exists rec_obj_insert on storage.objects;
create policy rec_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings'
              and (storage.foldername(name))[1] = auth.uid()::text
              and name ~ '^[0-9a-f-]{36}/[0-9a-f]{32}\.(webm|mp4)$');
drop policy if exists rec_obj_delete on storage.objects;
create policy rec_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_level('mod')));

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
create policy rec_sel on public.recordings for select to authenticated using (user_id = auth.uid() or public.has_level('mod'));
drop policy if exists rec_ins on public.recordings;
create policy rec_ins on public.recordings for insert to authenticated
  with check (user_id = auth.uid() and split_part(path, '/', 1) = auth.uid()::text);
drop policy if exists rec_del on public.recordings;
create policy rec_del on public.recordings for delete to authenticated using (user_id = auth.uid() or public.has_level('mod'));
revoke all on public.recordings from anon;
revoke update, truncate on public.recordings from authenticated;
grant select, insert, delete on public.recordings to authenticated;

-- 3. switches: on/off and how many clips one player may keep
insert into public.site_settings(key, value) values ('recordings_enabled', 'true') on conflict do nothing;
insert into public.site_settings(key, value) values ('recordings_max', '8') on conflict do nothing;

-- 4. rules checked on every new clip: switch on, not banned, the file really uploaded, under the per-player limit
create or replace function public.rec_rules() returns trigger language plpgsql security definer set search_path=public as $$
declare s player_status; lim int; n int;
begin
  if coalesce(setting('recordings_enabled')::text, 'true') <> 'true' then raise exception 'Recordings are turned off right now.'; end if;
  select * into s from player_status where name = lower(btrim(new.name));
  if s.state in ('banned', 'suspended') and (s.until is null or s.until > now()) then raise exception 'Your account is restricted.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'recordings' and name = new.path) then
    raise exception 'That recording did not upload. Try again.'; end if;
  lim := coalesce((setting('recordings_max') #>> '{}')::int, 8);
  select count(*) into n from recordings where user_id = new.user_id;
  if n >= lim then raise exception 'You already have % recordings saved. Delete one to save a new one.', lim; end if;
  new.name := btrim(new.name);
  return new;
end $$;
drop trigger if exists rec_rules_trg on public.recordings;
create trigger rec_rules_trg before insert on public.recordings for each row execute function public.rec_rules();

-- deleting a clip also removes any chat message that shared it
create or replace function public.rec_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from chat_messages where kind = 'recording' and meta ->> 'path' = old.path;
  return old;
end $$;
drop trigger if exists rec_cleanup_trg on public.recordings;
create trigger rec_cleanup_trg after delete on public.recordings for each row execute function public.rec_cleanup();

-- 5. chat: new message kind "recording"
alter table public.chat_messages drop constraint if exists chat_msg_kind_ck;
alter table public.chat_messages add constraint chat_msg_kind_ck check (kind in ('text','score','poll','image','recording'));

-- same rules as chat-images-setup.sql, plus: a recording can only be shared by the account that owns it,
-- and its details (game, length) come from the library, not from what the browser sent
create or replace function public.chat_rules() returns trigger language plpgsql security definer set search_path=public as $$
declare ch record; st record; a text; b text; me text := lower(btrim(new.name)); gm text; sc int; pth text; rr record;
begin
  select * into st from staff where chat_name is not null and lower(btrim(chat_name))=me limit 1;
  if found and lower(coalesce(auth.jwt()->>'email',''))<>lower(st.email) then
    raise exception 'That name belongs to a staff member. Please pick a different name.'; end if;
  if new.channel like 'dm:%' then
    if coalesce(setting('chat_dms_enabled')::text,'false')<>'true' then raise exception 'Direct messages are turned off.'; end if;
    a := split_part(substr(new.channel,4),'|',1); b := split_part(substr(new.channel,4),'|',2);
    if a='' or b='' or a=b or me not in (a,b) then raise exception 'That is not your conversation.'; end if;
  elsif new.channel like 'g-%' then
    if not exists(select 1 from games_config where id=substr(new.channel,3)) then raise exception 'Unknown channel.'; end if;
  else
    select * into ch from chat_channels where id=new.channel;
    if not found then raise exception 'Unknown channel.'; end if;
    if ch.staff_only and not has_level('mod') then raise exception 'Only staff can post in this channel.'; end if;
    if ch.score_only and new.kind<>'score' and not has_level('mod') then raise exception 'This channel is for sharing high scores. Use the + button.'; end if;
  end if;
  if new.kind='score' then
    begin gm := new.meta->>'game'; sc := (new.meta->>'score')::int;
    exception when others then raise exception 'Invalid score card.'; end;
    if not exists(select 1 from scores where lower(btrim(name))=me and game=gm and score=sc) then
      raise exception 'That score is not on the leaderboard under your name.'; end if;
  elsif new.kind='poll' then
    if jsonb_typeof(new.meta->'opts')<>'array' or jsonb_array_length(new.meta->'opts') not between 2 and 4 then raise exception 'A poll needs 2 to 4 options.'; end if;
    if exists(select 1 from jsonb_array_elements_text(new.meta->'opts') o where length(btrim(o))=0 or length(o)>40) then raise exception 'Poll options must be 1 to 40 characters.'; end if;
  elsif new.kind='image' then
    if coalesce(setting('chat_images_enabled')::text,'true')<>'true' then raise exception 'Photos are turned off right now.'; end if;
    pth := new.meta->>'path';
    if pth is null or pth !~ '^[0-9a-f]{32}\.jpg$' then raise exception 'Invalid photo.'; end if;
    if not exists(select 1 from storage.objects where bucket_id='chat-images' and name=pth) then raise exception 'That photo did not upload. Try again.'; end if;
    new.meta := jsonb_build_object('path', pth);   -- keep nothing else
    new.message := 'sent a photo';
  elsif new.kind='recording' then
    if coalesce(setting('recordings_enabled')::text,'true')<>'true' then raise exception 'Recordings are turned off right now.'; end if;
    pth := new.meta->>'path';
    select * into rr from recordings where path = pth and user_id = auth.uid();
    if not found then raise exception 'You can only share your own recordings. Log in with Google first.'; end if;
    new.meta := jsonb_build_object('path', rr.path, 'game', rr.game, 'secs', rr.secs, 'score', rr.score);
    new.message := 'shared a recording';
  else
    new.meta := null;
  end if;
  if new.reply_to is not null and not exists(select 1 from chat_messages where id=new.reply_to and channel=new.channel) then new.reply_to := null; end if;
  return new;
end $$;
