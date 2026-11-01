-- Chatter: attachments, announcements (owner only), and full owner powers for 30yua@tesdk12.net.
-- Run once in Supabase Dashboard > SQL Editor, AFTER all the other migrations. Safe to re-run.
-- (Voice chat and notification sounds are browser-side and need nothing here.)

-- ───────── 1. Make 30yua@tesdk12.net the owner (the owner has every permission, and nobody can touch the owner) ─────────
-- If someone else is currently the owner, they become an admin. If 30yua has no account/profile yet, this part is skipped.
do $own$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = '30yua@tesdk12.net';
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise notice 'Owner step skipped: sign in to Chatter once with 30yua@tesdk12.net, then re-run this script.';
    return;
  end if;
  insert into public.app_config (key, value) values ('owner_user_id', uid::text)
    on conflict (key) do update set value = excluded.value;
  perform public.apply_owner(uid);
end $own$;

-- ───────── 2. Announcements: only the owner can post in channels marked owner_only ─────────
alter table public.channels add column if not exists owner_only boolean not null default false;
update public.channels set owner_only = true where kind = 'text' and lower(name) = 'announcements';

create or replace function public.can_post(cid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c channels; sm server_members;
begin
  select * into c from channels where id = cid;
  if c.id is null or c.kind <> 'text' then return false; end if;
  select * into sm from server_members where server_id = c.server_id and user_id = auth.uid();
  if sm.user_id is null then return false; end if;
  if not public.can_read_channel(cid) then return false; end if;
  if c.owner_only and sm.role <> 'owner' then return false; end if;
  if sm.timeout_until is not null and sm.timeout_until > now() then return false; end if;
  if c.locked and not (sm.role = 'owner' or public.has_perm('lock_channels')) then return false; end if;
  return true;
end $$;

create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels; sm server_members; wait_s int;
begin
  if tg_op = 'INSERT' then
    if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
      raise exception 'You are sending messages too fast. Wait a few seconds.';
    end if;
    if new.channel_id is not null then
      select * into c from channels where id = new.channel_id;
      select * into sm from server_members where server_id = c.server_id and user_id = new.author_id;
      if sm.user_id is not null then
        if c.owner_only and sm.role <> 'owner' then
          raise exception 'Only the owner can post in #%.', c.name;
        end if;
        if sm.timeout_until is not null and sm.timeout_until > now() then
          raise exception 'You are timed out until %.', to_char(sm.timeout_until at time zone 'utc', 'Mon DD HH24:MI "UTC"');
        end if;
        if c.locked and not (sm.role = 'owner' or public.has_perm('lock_channels')) then
          raise exception 'This channel is locked.';
        end if;
        if c.slow_mode_seconds > 0 and not (sm.role = 'owner' or public.has_perm('slow_mode')) then
          select ceil(c.slow_mode_seconds - extract(epoch from (now() - max(created_at))))::int into wait_s
            from messages where channel_id = new.channel_id and author_id = new.author_id;
          if wait_s is not null and wait_s > 0 then raise exception 'Slow mode is on. Wait % more second(s).', wait_s; end if;
        end if;
      end if;
    end if;
  else
    if new.content is distinct from old.content then new.edited_at := now(); end if;
  end if;
  return new;
end $$;

-- ───────── 3. Attachments ─────────
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages drop constraint if exists messages_attachments_check;
alter table public.messages add constraint messages_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);

-- A message may now be empty if it carries at least one attachment.
do $c$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.messages'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%char_length(content)%' and conname <> 'messages_content_or_file'
  loop execute format('alter table public.messages drop constraint %I', r.conname); end loop;
end $c$;
alter table public.messages drop constraint if exists messages_content_or_file;
alter table public.messages add constraint messages_content_or_file
  check (char_length(content) <= 4000 and (char_length(content) >= 1 or jsonb_array_length(attachments) > 0));

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.conversation_id is not null then
    update conversations set last_message_at = new.created_at, last_author = new.author_id,
      last_message_preview = coalesce(nullif(left(new.content, 80), ''), 'Sent an attachment') where id = new.conversation_id;
  end if;
  return new;
end $$;

-- Private bucket. Files live at  <channel-or-conversation id>/<uploader id>/<file>  and can only be read by people who can read that chat.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array[
  'image/png','image/jpeg','image/webp','image/gif',
  'application/pdf','text/plain','application/zip',
  'audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/mp4',
  'video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.attach_scope_ok(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s text := (storage.foldername(p_name))[1]; u text := (storage.foldername(p_name))[2]; sid uuid;
begin
  if auth.uid() is null or s is null or s !~ '^[0-9a-f-]{36}$' then return false; end if;
  sid := s::uuid;
  if p_write then
    if u is distinct from auth.uid()::text then return false; end if;
    return public.is_conv_member(sid) or public.can_post(sid);
  end if;
  return public.is_conv_member(sid) or public.can_read_channel(sid);
end $$;
revoke execute on function public.attach_scope_ok(text, boolean) from public, anon;
grant  execute on function public.attach_scope_ok(text, boolean) to authenticated;

drop policy if exists att_read   on storage.objects;
drop policy if exists att_insert on storage.objects;
drop policy if exists att_delete on storage.objects;
create policy att_read   on storage.objects for select to authenticated using (bucket_id = 'attachments' and public.attach_scope_ok(name, false));
create policy att_insert on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and public.attach_scope_ok(name, true));
create policy att_delete on storage.objects for delete to authenticated using (bucket_id = 'attachments' and (storage.foldername(name))[2] = auth.uid()::text);
