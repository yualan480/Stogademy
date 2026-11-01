-- Chatter schema. Run once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

-- ───────── tables ─────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  bio text not null default '' check (char_length(bio) <= 190),
  avatar_color text not null default '#6d5efc' check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  avatar_url text,
  status text not null default 'online' check (status in ('online','idle','dnd','invisible')),
  custom_status text not null default '' check (char_length(custom_status) <= 80),
  created_at timestamptz not null default now()
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status = 'pending'),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);
create unique index friend_requests_pair_uq on public.friend_requests
  (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
create index on public.friend_requests(receiver_id);

create table public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index on public.friendships(user_b);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  dm_key text unique,                      -- "<smaller uuid>:<larger uuid>" prevents duplicate DMs
  last_message_at timestamptz,
  last_message_preview text,
  last_author uuid,
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index on public.conversation_members(user_id);

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 50),
  description text not null default '' check (char_length(description) <= 200),
  icon_color text not null default '#6d5efc' check (icon_color ~ '^#[0-9a-fA-F]{6}$'),
  owner_id uuid not null references public.profiles(id),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
create index on public.server_members(user_id);
create table public.channel_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position int not null default 0
);
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  category_id uuid references public.channel_categories(id) on delete set null,
  name text not null check (name ~ '^[a-z0-9-]{1,40}$'),
  description text not null default '' check (char_length(description) <= 200),
  kind text not null default 'text' check (kind in ('text','voice')),
  is_private boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.channels(server_id);
create table public.channel_members (   -- access list for private channels
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (channel_id, user_id)
);
create table public.server_invites (
  code text primary key default encode(gen_random_bytes(5), 'hex'),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  max_uses int check (max_uses > 0),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  reply_to uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  check ((conversation_id is null) <> (channel_id is null))
);
create index messages_conv_idx on public.messages(conversation_id, created_at desc) where conversation_id is not null;
create index messages_chan_idx on public.messages(channel_id, created_at desc) where channel_id is not null;
create index messages_author_idx on public.messages(author_id, created_at desc);
create index messages_search_idx on public.messages using gin (to_tsvector('simple', content));

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create table public.user_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dm_notifications boolean not null default true,
  mentions_only boolean not null default false,
  muted_channels uuid[] not null default '{}'
);

-- ───────── helper functions (security definer so RLS policies can't recurse) ─────────
create function public.is_conv_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid()) $$;

create function public.server_role(sid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from server_members where server_id = sid and user_id = auth.uid() $$;

create function public.is_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(server_role(sid) in ('owner','admin','moderator'), false) $$;

create function public.is_admin(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(server_role(sid) in ('owner','admin'), false) $$;

create function public.can_read_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    join server_members m on m.server_id = c.server_id and m.user_id = auth.uid()
    where c.id = cid and (
      not c.is_private or m.role in ('owner','admin','moderator')
      or exists (select 1 from channel_members cm where cm.channel_id = c.id and cm.user_id = auth.uid())
    )) $$;

-- ───────── triggers ─────────
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data->>'username',''));
begin
  insert into profiles (id, username, display_name)
  values (new.id, u, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), u));
  insert into user_notification_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
      raise exception 'You are sending messages too fast. Wait a few seconds.';
    end if;
  else
    if new.content is distinct from old.content then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
create trigger messages_guard_ins before insert on public.messages for each row execute function public.messages_guard();
create trigger messages_guard_upd before update on public.messages for each row execute function public.messages_guard();

create function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.conversation_id is not null then
    update conversations set last_message_at = new.created_at, last_author = new.author_id,
      last_message_preview = left(new.content, 80) where id = new.conversation_id;
  end if;
  return new;
end $$;
create trigger messages_after_ins after insert on public.messages for each row execute function public.messages_after_insert();

create function public.friend_request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from friendships where user_a = least(new.sender_id,new.receiver_id) and user_b = greatest(new.sender_id,new.receiver_id)) then
    raise exception 'You are already friends.';
  end if;
  return new;
end $$;
create trigger friend_request_guard_ins before insert on public.friend_requests for each row execute function public.friend_request_guard();

-- ───────── RPCs (the only way to create DMs, servers, friendships, memberships) ─────────
create function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = lower(u)) $$;
grant execute on function public.username_available(text) to anon, authenticated;

create function public.start_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare k text; cid uuid;
begin
  if auth.uid() is null or other is null or other = auth.uid() then raise exception 'Invalid user.'; end if;
  if not exists (select 1 from profiles where id = other) then raise exception 'User not found.'; end if;
  k := least(auth.uid()::text, other::text) || ':' || greatest(auth.uid()::text, other::text);
  select id into cid from conversations where dm_key = k;
  if cid is null then
    insert into conversations (dm_key) values (k) on conflict (dm_key) do nothing returning id into cid;
    if cid is null then select id into cid from conversations where dm_key = k; end if;
    insert into conversation_members (conversation_id, user_id) values (cid, auth.uid()), (cid, other) on conflict do nothing;
  end if;
  return cid;
end $$;

create function public.respond_friend_request(req uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r friend_requests;
begin
  select * into r from friend_requests where id = req and receiver_id = auth.uid();
  if r.id is null then raise exception 'Request not found.'; end if;
  if accept then
    insert into friendships (user_a, user_b) values (least(r.sender_id, r.receiver_id), greatest(r.sender_id, r.receiver_id)) on conflict do nothing;
  end if;
  delete from friend_requests where id = req;
end $$;

create function public.create_server(p_name text, p_description text, p_public boolean, p_color text default '#6d5efc') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; cat uuid;
begin
  insert into servers (name, description, is_public, icon_color, owner_id) values (p_name, coalesce(p_description,''), p_public, p_color, auth.uid()) returning id into sid;
  insert into server_members (server_id, user_id, role) values (sid, auth.uid(), 'owner');
  insert into channel_categories (server_id, name) values (sid, 'Text channels') returning id into cat;
  insert into channels (server_id, category_id, name, description, position) values
    (sid, cat, 'general', 'Talk about anything', 0), (sid, cat, 'introductions', 'Say hi to everyone', 1);
  return sid;
end $$;

create function public.join_server(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i server_invites;
begin
  select * into i from server_invites where code = p_code;
  if i.code is null or (i.expires_at is not null and i.expires_at < now()) or (i.max_uses is not null and i.uses >= i.max_uses) then
    raise exception 'This invite is invalid or expired.';
  end if;
  insert into server_members (server_id, user_id) values (i.server_id, auth.uid()) on conflict do nothing;
  update server_invites set uses = uses + 1 where code = p_code;
  return i.server_id;
end $$;

create function public.join_public_server(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from servers where id = sid and is_public) then raise exception 'This server is private.'; end if;
  insert into server_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
end $$;

-- ───────── Row Level Security ─────────
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channel_categories enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.server_invites enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.user_notification_settings enable row level security;

-- column-level limits: users can only change the fields listed here
revoke update on public.profiles, public.messages, public.conversation_members, public.server_members from authenticated, anon;
grant update (display_name, bio, avatar_color, avatar_url, status, custom_status) on public.profiles to authenticated;
grant update (content) on public.messages to authenticated;
grant update (last_read_at, muted) on public.conversation_members to authenticated;
grant update (role) on public.server_members to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy fr_read on public.friend_requests for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy fr_insert on public.friend_requests for insert to authenticated with check (sender_id = auth.uid());
create policy fr_delete on public.friend_requests for delete to authenticated using (sender_id = auth.uid());  -- cancel; receivers use the RPC

create policy fs_read on public.friendships for select to authenticated using (auth.uid() in (user_a, user_b));
create policy fs_delete on public.friendships for delete to authenticated using (auth.uid() in (user_a, user_b));

create policy conv_read on public.conversations for select to authenticated using (public.is_conv_member(id));
create policy cm_read on public.conversation_members for select to authenticated using (public.is_conv_member(conversation_id));
create policy cm_update on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy msg_read on public.messages for select to authenticated using (
  (conversation_id is not null and public.is_conv_member(conversation_id))
  or (channel_id is not null and public.can_read_channel(channel_id)));
create policy msg_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and (
    (conversation_id is not null and public.is_conv_member(conversation_id))
    or (channel_id is not null and public.can_read_channel(channel_id))));
create policy msg_update on public.messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy msg_delete on public.messages for delete to authenticated using (
  author_id = auth.uid()
  or (channel_id is not null and exists (select 1 from channels c where c.id = channel_id and public.is_staff(c.server_id))));

create policy react_read on public.message_reactions for select to authenticated using (exists (select 1 from messages m where m.id = message_id));
create policy react_insert on public.message_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id));
create policy react_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid());

create policy srv_read on public.servers for select to authenticated using (is_public or public.server_role(id) is not null);
create policy srv_update on public.servers for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id) and owner_id = (select owner_id from servers s where s.id = servers.id));
create policy srv_delete on public.servers for delete to authenticated using (public.server_role(id) = 'owner');

create policy sm_read on public.server_members for select to authenticated using (public.server_role(server_id) is not null);
-- only the owner changes roles, and nobody can mint a second owner
create policy sm_role on public.server_members for update to authenticated using (public.server_role(server_id) = 'owner' and role <> 'owner')
  with check (role in ('admin','moderator','member'));
create policy sm_leave on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and role <> 'owner')
  or (public.is_staff(server_id) and role = 'member')
  or (public.server_role(server_id) = 'owner' and role <> 'owner'));

create policy cat_read on public.channel_categories for select to authenticated using (public.server_role(server_id) is not null);
create policy cat_write on public.channel_categories for all to authenticated using (public.is_admin(server_id)) with check (public.is_admin(server_id));
create policy ch_read on public.channels for select to authenticated using (public.can_read_channel(id));
create policy ch_write on public.channels for all to authenticated using (public.is_admin(server_id)) with check (public.is_admin(server_id));
create policy chm_read on public.channel_members for select to authenticated using (user_id = auth.uid() or exists (select 1 from channels c where c.id = channel_id and public.is_admin(c.server_id)));
create policy chm_write on public.channel_members for all to authenticated using (exists (select 1 from channels c where c.id = channel_id and public.is_admin(c.server_id))) with check (exists (select 1 from channels c where c.id = channel_id and public.is_admin(c.server_id)));
create policy inv_read on public.server_invites for select to authenticated using (public.is_staff(server_id));
create policy inv_insert on public.server_invites for insert to authenticated with check (public.is_staff(server_id) and created_by = auth.uid());
create policy inv_delete on public.server_invites for delete to authenticated using (public.is_admin(server_id));
create policy ns_own on public.user_notification_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────── Realtime (respects RLS) ─────────
alter publication supabase_realtime add table public.messages, public.message_reactions, public.conversation_members, public.friend_requests, public.friendships;

-- ───────── Storage: avatars (public read, users write only to their own folder) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp']) on conflict (id) do nothing;
create policy avatars_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
