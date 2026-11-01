-- CHAT PHOTOS SETUP. Run once in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Adds photo attachments to the chat: a public "chat-images" bucket, an "image" message kind,
-- a server-side check on every photo post, and an on/off switch (site_settings key chat_images_enabled).

-- 1. storage bucket: JPEG only, 600 KB max (the site shrinks every picture to fit before uploading)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', true, 614400, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 614400, allowed_mime_types = array['image/jpeg'];

-- visitors may add files to this bucket only, with a random-looking name, and may not change or delete them
drop policy if exists chat_images_insert on storage.objects;
create policy chat_images_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'chat-images' and name ~ '^[0-9a-f]{32}\.jpg$');

-- 2. allow the new message kind
alter table public.chat_messages drop constraint if exists chat_msg_kind_ck;
alter table public.chat_messages add constraint chat_msg_kind_ck check (kind in ('text','score','poll','image'));

-- 3. on/off switch (turn off from the admin panel's settings, or: update site_settings set value='false' where key='chat_images_enabled')
insert into public.site_settings(key, value) values ('chat_images_enabled', 'true') on conflict do nothing;

-- 4. same rules as before, plus the photo checks
create or replace function public.chat_rules() returns trigger language plpgsql security definer set search_path=public as $$
declare ch record; st record; a text; b text; me text := lower(btrim(new.name)); gm text; sc int; pth text;
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
  else
    new.meta := null;
  end if;
  if new.reply_to is not null and not exists(select 1 from chat_messages where id=new.reply_to and channel=new.channel) then new.reply_to := null; end if;
  return new;
end $$;
