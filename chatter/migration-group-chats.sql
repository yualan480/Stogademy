-- Chatter: group chats in Direct Messages. Run once in Supabase SQL Editor, AFTER the other migrations. Safe to re-run.
--
--   * A group chat is a normal conversation with is_group = true, an optional name, and 3 to 10 people.
--   * Anyone in a group can rename it, add people, and leave. Only the person who made it (created_by) can remove others.
--     If the creator leaves, the longest-standing member becomes the new creator.
--   * Joins, leaves and renames post a small system message in the chat ("Sam added Alex.").
--   * Existing one-to-one DMs are untouched (start_dm still works exactly as before).

-- 1. Columns
alter table public.conversations
  add column if not exists is_group   boolean not null default false,
  add column if not exists name       text check (name is null or char_length(name) between 1 and 50),
  add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.conversation_members
  add column if not exists joined_at timestamptz not null default now();

-- 2. Helpers
create or replace function public.group_display_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), username, 'Someone') from profiles where id = uid $$;

create or replace function public.group_say(cid uuid, txt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into messages (conversation_id, author_id, content, is_system) values (cid, auth.uid(), left(txt, 4000), true);
end $$;

-- 3. Create a group
create or replace function public.create_group_chat(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; ids uuid[]; nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select coalesce(array_agg(distinct u), '{}') into ids from unnest(coalesce(p_members, '{}')) u where u is not null and u <> auth.uid();
  if (select count(*) from profiles where id = any(ids)) <> coalesce(array_length(ids, 1), 0) then raise exception 'One of those users was not found.'; end if;
  if coalesce(array_length(ids, 1), 0) < 2 then raise exception 'A group needs at least 3 people, including you. For two people, send a direct message.'; end if;
  if array_length(ids, 1) > 9 then raise exception 'Groups can have up to 10 people.'; end if;
  if nm is not null then
    if char_length(nm) > 50 then raise exception 'Group names can be up to 50 characters.'; end if;
    if to_regprocedure('public.mask_profanity(text)') is not null then execute 'select public.mask_profanity($1)' into nm using nm; end if;   -- profanity filter is optional
  end if;
  insert into conversations (is_group, name, created_by) values (true, nm, auth.uid()) returning id into cid;
  insert into conversation_members (conversation_id, user_id) select cid, u from unnest(ids || auth.uid()) u;
  perform public.group_say(cid, public.group_display_name(auth.uid()) || ' created the group.');
  return cid;
end $$;

-- 4. Add people (any member)
create or replace function public.add_group_members(cid uuid, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare ids uuid[]; names text;
begin
  if not exists (select 1 from conversations where id = cid and is_group) then raise exception 'Group not found.'; end if;
  if not public.is_conv_member(cid) then raise exception 'Group not found.'; end if;
  select coalesce(array_agg(distinct u), '{}') into ids from unnest(coalesce(p_members, '{}')) u
    where u is not null and not exists (select 1 from conversation_members where conversation_id = cid and user_id = u);
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Those people are already in the group.'; end if;
  if (select count(*) from profiles where id = any(ids)) <> array_length(ids, 1) then raise exception 'One of those users was not found.'; end if;
  if (select count(*) from conversation_members where conversation_id = cid) + array_length(ids, 1) > 10 then raise exception 'Groups can have up to 10 people.'; end if;
  insert into conversation_members (conversation_id, user_id) select cid, u from unnest(ids) u;
  select string_agg(public.group_display_name(u), ', ') into names from unnest(ids) u;
  perform public.group_say(cid, public.group_display_name(auth.uid()) || ' added ' || names || '.');
end $$;

-- 5. Rename (any member). An empty name clears it, so the chat is shown by its members' names again.
create or replace function public.rename_group(cid uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not exists (select 1 from conversations where id = cid and is_group) or not public.is_conv_member(cid) then raise exception 'Group not found.'; end if;
  if nm is not null then
    if char_length(nm) > 50 then raise exception 'Group names can be up to 50 characters.'; end if;
    if to_regprocedure('public.mask_profanity(text)') is not null then execute 'select public.mask_profanity($1)' into nm using nm; end if;   -- profanity filter is optional
  end if;
  update conversations set name = nm where id = cid;
  perform public.group_say(cid, public.group_display_name(auth.uid()) || case when nm is null then ' cleared the group name.' else ' renamed the group to "' || nm || '".' end);
end $$;

-- 6. Remove someone (creator only)
create or replace function public.remove_group_member(cid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversations where id = cid and is_group and created_by = auth.uid()) then raise exception 'Only the person who made the group can remove people.'; end if;
  if uid = auth.uid() then raise exception 'Use Leave group instead.'; end if;
  if not exists (select 1 from conversation_members where conversation_id = cid and user_id = uid) then raise exception 'That person is not in the group.'; end if;
  perform public.group_say(cid, public.group_display_name(auth.uid()) || ' removed ' || public.group_display_name(uid) || '.');
  delete from conversation_members where conversation_id = cid and user_id = uid;
end $$;

-- 7. Leave (any member). The last person out deletes the group and its messages.
create or replace function public.leave_group(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conversations; nxt uuid;
begin
  select * into c from conversations where id = cid and is_group;
  if c.id is null or not public.is_conv_member(cid) then raise exception 'Group not found.'; end if;
  if (select count(*) from conversation_members where conversation_id = cid) <= 1 then
    delete from conversations where id = cid; return;
  end if;
  perform public.group_say(cid, public.group_display_name(auth.uid()) || ' left the group.');
  delete from conversation_members where conversation_id = cid and user_id = auth.uid();
  if c.created_by = auth.uid() then
    select user_id into nxt from conversation_members where conversation_id = cid order by joined_at, user_id limit 1;
    update conversations set created_by = nxt where id = cid;
  end if;
end $$;

-- 8. Only signed-in users may call these (helpers are internal only)
revoke execute on function public.group_display_name(uuid), public.group_say(uuid, text) from public, anon, authenticated;
revoke execute on function public.create_group_chat(text, uuid[]), public.add_group_members(uuid, uuid[]), public.rename_group(uuid, text),
  public.remove_group_member(uuid, uuid), public.leave_group(uuid) from public, anon;
grant execute on function public.create_group_chat(text, uuid[]), public.add_group_members(uuid, uuid[]), public.rename_group(uuid, text),
  public.remove_group_member(uuid, uuid), public.leave_group(uuid) to authenticated;

-- 9. Realtime: let members see renames and membership changes live
do $$ begin
  begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
end $$;

-- 10. Make the API notice the new functions right away.
notify pgrst, 'reload schema';
