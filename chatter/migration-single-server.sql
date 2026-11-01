-- Chatter: ONE server that every account joins automatically.
-- Run once in Supabase Dashboard > SQL Editor, AFTER the original migration. Safe to re-run.

-- 1. Creates the main server (and its channels) if none exists yet.
--    If you already made a server, the oldest one is used as the main server and is left as-is.
create or replace function public.ensure_main_server(first_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; t uuid; v uuid;
begin
  select id into sid from servers order by created_at limit 1;
  if sid is not null then return sid; end if;

  insert into servers (name, description, icon_color, owner_id, is_public)
    values ('Chatter', 'Just a place to chat, hang out, and be yourself!', '#5865f2', first_user, false)
    returning id into sid;
  insert into server_members (server_id, user_id, role) values (sid, first_user, 'owner');

  insert into channel_categories (server_id, name, position) values (sid, 'Text Channels', 0) returning id into t;
  insert into channel_categories (server_id, name, position) values (sid, 'Voice Channels', 1) returning id into v;
  insert into channels (server_id, category_id, name, description, kind, position) values
    (sid, t, 'general',       'Just a place to chat, hang out, and be yourself!', 'text', 0),
    (sid, t, 'announcements', 'News and updates',                                  'text', 1),
    (sid, t, 'gaming',        'Talk games',                                        'text', 2),
    (sid, t, 'off-topic',     'Anything goes',                                     'text', 3),
    (sid, t, 'memes',         'Keep it friendly',                                  'text', 4),
    (sid, t, 'help',          'Ask questions here',                                'text', 5),
    (sid, v, 'general',       '', 'voice', 0),
    (sid, v, 'gaming',        '', 'voice', 1),
    (sid, v, 'music',         '', 'voice', 2),
    (sid, v, 'afk',           '', 'voice', 3);
  return sid;
end $$;

-- 2. Every new profile is added to the main server. (A separate trigger, so your
--    existing handle_new_user() function is not touched.)
create or replace function public.join_main_server() returns trigger
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  sid := public.ensure_main_server(new.id);
  insert into server_members (server_id, user_id) values (sid, new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_profile_created_join_server on public.profiles;
create trigger on_profile_created_join_server after insert on public.profiles
  for each row execute function public.join_main_server();

-- 2b. Safety net for log-in: the app calls this if the signed-in user isn't in the server yet.
create or replace function public.ensure_membership() returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  sid := public.ensure_main_server(auth.uid());
  insert into server_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;
grant execute on function public.ensure_membership() to authenticated;

-- 3. Add everyone who already has an account, and name the server Chatter.
do $$
declare first_user uuid; sid uuid;
begin
  select id into first_user from profiles order by created_at limit 1;
  if first_user is null then return; end if;
  sid := public.ensure_main_server(first_user);
  insert into server_members (server_id, user_id) select sid, id from profiles on conflict do nothing;
  update servers set name = 'Chatter' where id = sid;
end $$;

-- 4. Lock down: nobody can create servers, use invites, or leave on their own.
revoke execute on function public.create_server(text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.join_server(text)                        from public, anon, authenticated;
revoke execute on function public.join_public_server(uuid)                 from public, anon, authenticated;
revoke execute on function public.ensure_main_server(uuid)                 from public, anon, authenticated;
revoke execute on function public.join_main_server()                       from public, anon, authenticated;

drop policy if exists sm_leave on public.server_members;
create policy sm_leave on public.server_members for delete to authenticated using (
  (public.is_staff(server_id) and role = 'member')
  or (public.server_role(server_id) = 'owner' and role <> 'owner'));
