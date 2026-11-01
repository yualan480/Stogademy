-- Chatter: Owner + Administration + Moderation system.
-- Run once in Supabase Dashboard > SQL Editor, AFTER migration.sql and migration-single-server.sql. Safe to re-run.
--
-- ┌─ STEP 1 (required) ───────────────────────────────────────────────────────────────┐
-- │ 1. Sign up on Chatter with the account that should own the server and confirm it. │
-- │ 2. Put that account's email on the line marked  <<< EDIT  just below.              │
-- │ 3. Run the whole script. It stops with a clear message if the email isn't valid.   │
-- └────────────────────────────────────────────────────────────────────────────────────┘
-- The owner is stored as a user id inside the database (never as a username anyone can claim).
-- Nobody can become owner from the app; the only way to change owner is to edit the email
-- below and re-run this script in the SQL Editor.

create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

do $cfg$
declare
  e   text := lower(trim('CHANGE-ME@example.com'));   -- <<< EDIT: the owner's email address
  uid uuid;
begin
  if e like 'change-me%' or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Setup stopped: put the owner''s real email address on the line marked EDIT, then run the script again.';
  end if;
  select id into uid from auth.users where lower(email) = e and email_confirmed_at is not null;
  if uid is null then
    raise exception 'Setup stopped: no confirmed account has the email %. Sign up on Chatter with it first, confirm it, then run this script.', e;
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'Setup stopped: that account has no profile yet. Log in to Chatter once with it, then run this script.';
  end if;
  insert into public.app_config (key, value) values ('owner_user_id', uid::text)
    on conflict (key) do update set value = excluded.value;
end $cfg$;

-- ───────── new columns ─────────
alter table public.servers        add column if not exists welcome_message text not null default '' check (char_length(welcome_message) <= 500);
alter table public.servers        add column if not exists icon_text text check (icon_text is null or char_length(icon_text) between 1 and 4);
alter table public.server_members add column if not exists timeout_until timestamptz;
alter table public.channels       add column if not exists locked boolean not null default false;
alter table public.channels       add column if not exists slow_mode_seconds int not null default 0 check (slow_mode_seconds between 0 and 21600);

-- exactly one owner per server
create unique index if not exists one_owner_per_server on public.server_members (server_id) where role = 'owner';

-- ───────── new tables ─────────
create table if not exists public.bans (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  kind      text not null default 'ban' check (kind in ('ban','kick')),   -- a kick is a 10-minute cool-down
  reason    text not null default '',
  until     timestamptz,
  banned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role       text not null check (role in ('admin','moderator')),
  permission text not null check (permission in ('delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit')),
  granted    boolean not null default false,
  primary key (role, permission)
);
-- Defaults: admins get everything delegable; moderators ONLY get what is listed here (the owner can change it).
insert into public.role_permissions (role, permission, granted)
select r, p, case r when 'admin' then true else p in ('delete_messages','timeout','view_reports','resolve_reports') end
from unnest(array['admin','moderator']) r,
     unnest(array['delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit']) p
on conflict do nothing;

create table if not exists public.pinned_messages (
  message_id uuid primary key references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  pinned_by  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pinned_messages_channel_idx on public.pinned_messages(channel_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user uuid references public.profiles(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete set null,
  channel_id  uuid references public.channels(id) on delete set null,
  message_content text,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports(status, created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

-- ───────── permission helpers ─────────
create or replace function public.main_server() returns uuid
language sql stable security definer set search_path = public as $$
  select id from servers order by created_at limit 1 $$;

create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'owner' then 0 when 'admin' then 1 when 'moderator' then 2 else 3 end $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(server_role(main_server()) = 'owner', false) $$;

-- Owner: everything. Admin/Moderator: only what role_permissions explicitly grants. Others: nothing.
-- manage_server / manage_roles / manage_names / manage_permissions are owner-only and can never be delegated.
create or replace function public.has_perm(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  if p in ('manage_server','manage_roles','manage_names','manage_permissions') then return false; end if;
  if r not in ('admin','moderator') then return false; end if;
  return coalesce((select granted from role_permissions where role = r and permission = p), false);
end $$;

create or replace function public.my_permissions() returns text[]
language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r = 'owner' then
    return array['delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit',
                 'manage_server','manage_roles','manage_names','manage_permissions'];
  end if;
  if r in ('admin','moderator') then
    return coalesce((select array_agg(permission) from role_permissions where role = r and granted), '{}');
  end if;
  return '{}';
end $$;

-- Can the signed-in user post in this channel right now? (member, not timed out, channel not locked)
create or replace function public.can_post(cid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c channels; sm server_members;
begin
  select * into c from channels where id = cid;
  if c.id is null or c.kind <> 'text' then return false; end if;
  select * into sm from server_members where server_id = c.server_id and user_id = auth.uid();
  if sm.user_id is null then return false; end if;
  if not public.can_read_channel(cid) then return false; end if;
  if sm.timeout_until is not null and sm.timeout_until > now() then return false; end if;
  if c.locked and not (sm.role = 'owner' or public.has_perm('lock_channels')) then return false; end if;
  return true;
end $$;

-- internal: write an audit entry as the signed-in user
create or replace function public.log_action(p_action text, p_target uuid default null, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, target_user, details) values (auth.uid(), p_action, p_target, coalesce(p_details, '{}')) $$;

-- internal: may the signed-in user perform p_perm on p_target? (never self, never the owner, only people ranked below)
create or replace function public.assert_can_act(p_target uuid, p_perm text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); my_role text := server_role(main_server()); tr text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not has_perm(p_perm) then raise exception 'You do not have permission to do that.'; end if;
  if p_target = auth.uid() then raise exception 'You cannot do that to yourself.'; end if;
  if not exists (select 1 from profiles where id = p_target) then raise exception 'User not found.'; end if;
  if p_target = (select owner_id from servers where id = sid) then raise exception 'The owner cannot be targeted.'; end if;
  select role into tr from server_members where server_id = sid and user_id = p_target;
  if tr = 'owner' then raise exception 'The owner cannot be targeted.'; end if;
  if tr is not null and role_rank(my_role) >= role_rank(tr) then
    raise exception 'You can only do that to people ranked below you.';
  end if;
end $$;

-- ───────── avatar colours (everyone gets a different one) ─────────
create sequence if not exists public.avatar_color_seq;

create or replace function public.hsl_hex(h numeric, s numeric, l numeric) returns text
language plpgsql immutable as $$
declare c numeric := (1 - abs(2 * l - 1)) * s; hp numeric := mod(h, 360) / 60;
        x numeric := c * (1 - abs(mod(hp, 2) - 1)); m numeric := l - c / 2; r numeric; g numeric; b numeric;
begin
  case floor(hp)::int
    when 0 then r := c; g := x; b := 0;
    when 1 then r := x; g := c; b := 0;
    when 2 then r := 0; g := c; b := x;
    when 3 then r := 0; g := x; b := c;
    when 4 then r := x; g := 0; b := c;
    else r := c; g := 0; b := x;
  end case;
  return '#' || lpad(to_hex(round((r + m) * 255)::int), 2, '0') || lpad(to_hex(round((g + m) * 255)::int), 2, '0') || lpad(to_hex(round((b + m) * 255)::int), 2, '0');
end $$;

-- golden-angle hue spacing: consecutive users are always far apart on the colour wheel
create or replace function public.avatar_color_for(n bigint) returns text
language sql immutable as $$
  select public.hsl_hex(n * 137.508, 0.62 + 0.08 * ((n / 3) % 2), 0.44 + 0.07 * (n % 3)) $$;

create or replace function public.profiles_assign_color() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.avatar_color := public.avatar_color_for(nextval('public.avatar_color_seq'));
  return new;
end $$;
drop trigger if exists profiles_assign_color_ins on public.profiles;
create trigger profiles_assign_color_ins before insert on public.profiles
  for each row execute function public.profiles_assign_color();

-- Login safety net: anyone still on the old default colour gets a fresh one.
create or replace function public.ensure_avatar_color() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select avatar_color into c from profiles where id = auth.uid();
  if lower(coalesce(c, '#6d5efc')) = '#6d5efc' then
    c := public.avatar_color_for(nextval('public.avatar_color_seq'));
    update profiles set avatar_color = c where id = auth.uid();
    return c;
  end if;
  return null;
end $$;

-- One-time: give every EXISTING user a new, different colour.
do $rc$
begin
  if not exists (select 1 from public.app_config where key = 'avatars_recolored') then
    with r as (select id, row_number() over (order by created_at, id) n from public.profiles)
    update public.profiles p set avatar_color = public.avatar_color_for(r.n) from r where p.id = r.id;
    perform setval('public.avatar_color_seq', greatest((select count(*) from public.profiles), 1));
    insert into public.app_config (key, value) values ('avatars_recolored', '1');
  end if;
end $rc$;

-- ───────── guards (triggers the app cannot bypass) ─────────
-- The owner can never be removed or demoted, nobody can change their own role, and ownership can't be handed out.
-- (SQL Editor / service-role sessions have no auth.uid() and are the only way to transfer ownership.)
create or replace function public.server_members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.owner_swap', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  if old.role = 'owner' then
    if tg_op = 'DELETE' then raise exception 'The owner cannot be removed.'; end if;
    if new.role <> 'owner' then raise exception 'The owner cannot be demoted.'; end if;
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if old.user_id = auth.uid() then raise exception 'You cannot change your own role.'; end if;
    if new.role = 'owner' then raise exception 'Ownership cannot be handed out from the app.'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;
drop trigger if exists server_members_guard_trg on public.server_members;
create trigger server_members_guard_trg before update or delete on public.server_members
  for each row execute function public.server_members_guard();

-- Messages: keep the old flood limit, add timeout / locked channel / slow mode with readable errors.
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

-- Deleting someone else's server message is logged.
create or replace function public.messages_audit_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if auth.uid() is not null and old.channel_id is not null and old.author_id <> auth.uid()
     and exists (select 1 from profiles where id = old.author_id) then
    select name into cname from channels where id = old.channel_id;
    if cname is not null then   -- null means the whole channel is being deleted (logged separately)
      perform public.log_action('message.delete', old.author_id, jsonb_build_object('channel', cname, 'content', left(old.content, 200)));
    end if;
  end if;
  return old;
end $$;
drop trigger if exists messages_audit_del_trg on public.messages;
create trigger messages_audit_del_trg before delete on public.messages
  for each row execute function public.messages_audit_del();

-- Log-in safety net: refuses banned / recently kicked users, otherwise makes sure they are a member.
create or replace function public.ensure_membership() returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; b bans;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into b from bans where user_id = auth.uid();
  if b.user_id is not null then
    if b.kind = 'ban' then
      raise exception 'You are banned from this server.%', case when b.reason <> '' then ' Reason: ' || b.reason else '' end;
    elsif b.until > now() then
      raise exception 'You were removed from the server. You can rejoin at %.', to_char(b.until at time zone 'utc', 'HH24:MI "UTC"');
    else
      delete from bans where user_id = auth.uid();
    end if;
  end if;
  sid := public.ensure_main_server(auth.uid());
  insert into server_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

-- ───────── moderation RPCs (the only way to do these things; each one is permission-checked and logged) ─────────
create or replace function public.timeout_user(p_target uuid, p_seconds int, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_act(p_target, 'timeout');
  if p_seconds < 0 or p_seconds > 2419200 then raise exception 'A timeout is between 0 seconds and 28 days.'; end if;
  update server_members set timeout_until = case when p_seconds = 0 then null else now() + make_interval(secs => p_seconds) end
    where server_id = public.main_server() and user_id = p_target;
  if not found then raise exception 'That user is not in the server.'; end if;
  perform public.log_action(case when p_seconds = 0 then 'member.untimeout' else 'member.timeout' end, p_target,
    jsonb_build_object('seconds', p_seconds, 'reason', left(coalesce(p_reason, ''), 200)));
end $$;

create or replace function public.kick_user(p_target uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_act(p_target, 'kick');
  delete from server_members where server_id = public.main_server() and user_id = p_target;
  if not found then raise exception 'That user is not in the server.'; end if;
  insert into bans (user_id, kind, reason, until, banned_by)
    values (p_target, 'kick', left(coalesce(p_reason, ''), 200), now() + interval '10 minutes', auth.uid())
    on conflict (user_id) do update set kind = 'kick', reason = excluded.reason, until = excluded.until, banned_by = excluded.banned_by, created_at = now()
    where public.bans.kind <> 'ban';
  perform public.log_action('member.kick', p_target, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
end $$;

create or replace function public.ban_user(p_target uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_act(p_target, 'ban');
  insert into bans (user_id, kind, reason, until, banned_by)
    values (p_target, 'ban', left(coalesce(p_reason, ''), 200), null, auth.uid())
    on conflict (user_id) do update set kind = 'ban', reason = excluded.reason, until = null, banned_by = excluded.banned_by, created_at = now();
  delete from server_members where server_id = public.main_server() and user_id = p_target;
  perform public.log_action('member.ban', p_target, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
end $$;

create or replace function public.unban_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_act(p_target, 'ban');
  delete from bans where user_id = p_target;
  insert into server_members (server_id, user_id) values (public.main_server(), p_target) on conflict do nothing;
  perform public.log_action('member.unban', p_target, '{}');
end $$;

create or replace function public.admin_set_role(p_target uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); old_role text;
begin
  if not public.is_owner() then raise exception 'Only the owner can change roles.'; end if;
  if p_role not in ('admin','moderator','member') then raise exception 'Role must be admin, moderator or member.'; end if;
  if p_target = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select role into old_role from server_members where server_id = sid and user_id = p_target;
  if old_role is null then raise exception 'That user is not in the server.'; end if;
  if old_role = 'owner' then raise exception 'The owner''s role cannot be changed.'; end if;
  update server_members set role = p_role where server_id = sid and user_id = p_target;
  perform public.log_action('member.role', p_target, jsonb_build_object('from', old_role, 'to', p_role));
end $$;

create or replace function public.admin_set_permission(p_role text, p_perm text, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change permissions.'; end if;
  if p_role not in ('admin','moderator') then raise exception 'Only admin and moderator permissions can be edited.'; end if;
  update role_permissions set granted = coalesce(p_granted, false) where role = p_role and permission = p_perm;
  if not found then raise exception 'Unknown permission.'; end if;
  perform public.log_action('permission.update', null, jsonb_build_object('role', p_role, 'permission', p_perm, 'granted', coalesce(p_granted, false)));
end $$;

create or replace function public.admin_update_server(p_name text, p_description text, p_icon_color text, p_icon_text text, p_welcome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change server settings.'; end if;
  p_name := trim(coalesce(p_name, ''));
  if char_length(p_name) not between 2 and 50 then raise exception 'The server name must be 2 to 50 characters.'; end if;
  if p_icon_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Pick a valid icon colour.'; end if;
  p_icon_text := nullif(trim(coalesce(p_icon_text, '')), '');
  if p_icon_text is not null and char_length(p_icon_text) > 4 then raise exception 'The icon text is at most 4 characters.'; end if;
  update servers set name = p_name, description = left(trim(coalesce(p_description, '')), 200), icon_color = p_icon_color,
    icon_text = p_icon_text, welcome_message = left(trim(coalesce(p_welcome, '')), 500)
    where id = public.main_server();
  perform public.log_action('server.update', null, jsonb_build_object('name', p_name));
end $$;

create or replace function public.admin_upsert_channel(p_id uuid, p_name text, p_description text, p_kind text, p_category uuid, p_private boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); cid uuid;
begin
  if not public.has_perm('manage_channels') then raise exception 'You do not have permission to do that.'; end if;
  p_name := lower(trim(coalesce(p_name, '')));
  if p_name !~ '^[a-z0-9-]{1,40}$' then raise exception 'Channel names use a-z, 0-9 and dashes (max 40).'; end if;
  if p_category is not null and not exists (select 1 from channel_categories where id = p_category and server_id = sid) then
    raise exception 'Unknown category.';
  end if;
  if p_id is null then
    if p_kind not in ('text','voice') then raise exception 'Channel type must be text or voice.'; end if;
    insert into channels (server_id, category_id, name, description, kind, is_private, position)
      values (sid, p_category, p_name, left(coalesce(p_description, ''), 200), p_kind, coalesce(p_private, false),
              coalesce((select max(position) + 1 from channels where server_id = sid), 0))
      returning id into cid;
    perform public.log_action('channel.create', null, jsonb_build_object('name', p_name, 'kind', p_kind));
  else
    update channels set name = p_name, description = left(coalesce(p_description, ''), 200), category_id = p_category, is_private = coalesce(p_private, false)
      where id = p_id and server_id = sid returning id into cid;
    if cid is null then raise exception 'Channel not found.'; end if;
    perform public.log_action('channel.update', null, jsonb_build_object('name', p_name));
  end if;
  return cid;
end $$;

create or replace function public.admin_delete_channel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); c channels;
begin
  if not public.has_perm('manage_channels') then raise exception 'You do not have permission to do that.'; end if;
  select * into c from channels where id = p_id and server_id = sid;
  if c.id is null then raise exception 'Channel not found.'; end if;
  if c.kind = 'text' and (select count(*) from channels where server_id = sid and kind = 'text') <= 1 then
    raise exception 'Keep at least one text channel.';
  end if;
  delete from channels where id = p_id;
  perform public.log_action('channel.delete', null, jsonb_build_object('name', c.name, 'kind', c.kind));
end $$;

create or replace function public.admin_reorder_channels(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); i int;
begin
  if not public.has_perm('manage_channels') then raise exception 'You do not have permission to do that.'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update channels set position = i - 1 where id = p_ids[i] and server_id = sid;
  end loop;
  perform public.log_action('channel.reorder', null, '{}');
end $$;

create or replace function public.admin_set_channel_lock(p_id uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if not public.has_perm('lock_channels') then raise exception 'You do not have permission to do that.'; end if;
  update channels set locked = coalesce(p_locked, false) where id = p_id and server_id = public.main_server() and kind = 'text' returning name into cname;
  if cname is null then raise exception 'Text channel not found.'; end if;
  perform public.log_action(case when p_locked then 'channel.lock' else 'channel.unlock' end, null, jsonb_build_object('name', cname));
end $$;

create or replace function public.admin_set_slow_mode(p_id uuid, p_seconds int) returns void
language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if not public.has_perm('slow_mode') then raise exception 'You do not have permission to do that.'; end if;
  if p_seconds < 0 or p_seconds > 21600 then raise exception 'Slow mode is between 0 seconds and 6 hours.'; end if;
  update channels set slow_mode_seconds = p_seconds where id = p_id and server_id = public.main_server() and kind = 'text' returning name into cname;
  if cname is null then raise exception 'Text channel not found.'; end if;
  perform public.log_action('channel.slowmode', null, jsonb_build_object('name', cname, 'seconds', p_seconds));
end $$;

create or replace function public.pin_message(p_message uuid, p_pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m messages; cname text;
begin
  if not public.has_perm('pin_messages') then raise exception 'You do not have permission to do that.'; end if;
  select * into m from messages where id = p_message;
  if m.id is null or m.channel_id is null then raise exception 'Only server messages can be pinned.'; end if;
  if not public.can_read_channel(m.channel_id) then raise exception 'Message not found.'; end if;
  select name into cname from channels where id = m.channel_id;
  if p_pin then
    if (select count(*) from pinned_messages where channel_id = m.channel_id) >= 20 then raise exception 'A channel can have at most 20 pinned messages.'; end if;
    insert into pinned_messages (message_id, channel_id, pinned_by) values (m.id, m.channel_id, auth.uid()) on conflict do nothing;
    perform public.log_action('message.pin', m.author_id, jsonb_build_object('channel', cname, 'content', left(m.content, 120)));
  else
    delete from pinned_messages where message_id = m.id;
    perform public.log_action('message.unpin', m.author_id, jsonb_build_object('channel', cname, 'content', left(m.content, 120)));
  end if;
end $$;

-- Reports (anyone in the server can file one)
create or replace function public.report_message(p_message uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  p_reason := trim(coalesce(p_reason, ''));
  if char_length(p_reason) not between 3 and 500 then raise exception 'Describe the problem in 3 to 500 characters.'; end if;
  select * into m from messages where id = p_message;
  if m.id is null or m.channel_id is null or not public.can_read_channel(m.channel_id) then raise exception 'You can only report server messages.'; end if;
  if m.author_id = auth.uid() then raise exception 'You cannot report your own message.'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and status = 'open') >= 10 then raise exception 'You already have 10 open reports. Please wait for a moderator.'; end if;
  insert into reports (reporter_id, target_user, message_id, channel_id, message_content, reason)
    values (auth.uid(), m.author_id, m.id, m.channel_id, left(m.content, 500), p_reason);
end $$;

create or replace function public.report_user(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  p_reason := trim(coalesce(p_reason, ''));
  if char_length(p_reason) not between 3 and 500 then raise exception 'Describe the problem in 3 to 500 characters.'; end if;
  if p_user = auth.uid() then raise exception 'You cannot report yourself.'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'User not found.'; end if;
  if (select count(*) from reports where reporter_id = auth.uid() and status = 'open') >= 10 then raise exception 'You already have 10 open reports. Please wait for a moderator.'; end if;
  insert into reports (reporter_id, target_user, reason) values (auth.uid(), p_user, p_reason);
end $$;

create or replace function public.resolve_report(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  if not public.has_perm('resolve_reports') then raise exception 'You do not have permission to do that.'; end if;
  update reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = left(coalesce(p_note, ''), 300)
    where id = p_id and status = 'open' returning * into r;
  if r.id is null then raise exception 'Report not found or already resolved.'; end if;
  perform public.log_action('report.resolve', r.target_user, jsonb_build_object('note', left(coalesce(p_note, ''), 200)));
end $$;

-- Dashboard data
create or replace function public.admin_list_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := main_server();
begin
  if not public.has_perm('view_users') then raise exception 'You do not have permission to do that.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'role', sm.role, 'is_member', sm.user_id is not null, 'timeout_until', sm.timeout_until,
      'ban_kind', b.kind, 'ban_until', b.until, 'ban_reason', b.reason,
      'email', case when public.is_owner() then u.email end) order by p.created_at)
    from profiles p
    left join server_members sm on sm.user_id = p.id and sm.server_id = sid
    left join bans b on b.user_id = p.id
    left join auth.users u on u.id = p.id), '[]'::jsonb);
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := main_server();
begin
  if server_role(sid) not in ('owner','admin','moderator') then raise exception 'You do not have permission to do that.'; end if;
  return jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'members',     (select count(*) from server_members where server_id = sid),
    'banned',      (select count(*) from bans where kind = 'ban'),
    'timed_out',   (select count(*) from server_members where server_id = sid and timeout_until > now()),
    'open_reports', case when public.has_perm('view_reports') then (select count(*) from reports where status = 'open') end,
    'messages_24h', (select count(*) from messages where channel_id is not null and created_at > now() - interval '24 hours'));
end $$;

-- Owner renames a user. Works with whatever name columns your profiles table has
-- (first_name / last_name / display_name / username) and skips generated ones.
create or replace function public.admin_set_user_name(p_target uuid, p_first text default null, p_last text default null, p_display text default null, p_username text default null) returns void
language plpgsql security definer set search_path = public as $$
declare sets text[] := '{}';
  colname text;
  val text;
  pairs text[][] := array[['first_name', p_first], ['last_name', p_last], ['display_name', p_display], ['username', p_username]];
  i int;
begin
  if not public.is_owner() then raise exception 'Only the owner can rename users.'; end if;
  if not exists (select 1 from profiles where id = p_target) then raise exception 'User not found.'; end if;
  for i in 1 .. 4 loop
    colname := pairs[i][1]; val := nullif(trim(coalesce(pairs[i][2], '')), '');
    if pairs[i][2] is null then continue; end if;
    if val is null then raise exception 'Names cannot be empty.'; end if;
    if char_length(val) > 32 then raise exception 'Names are at most 32 characters.'; end if;
    if colname = 'username' then
      val := lower(val);
      if val !~ '^[a-z0-9_]{3,20}$' then raise exception 'Usernames are 3 to 20 characters: a-z, 0-9 and underscores.'; end if;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
               and column_name = colname and is_generated = 'NEVER') then
      sets := sets || format('%I = %L', colname, val);
    end if;
  end loop;
  if array_length(sets, 1) is null then raise exception 'Nothing to change.'; end if;
  begin
    execute format('update public.profiles set %s where id = %L', array_to_string(sets, ', '), p_target);
  exception when unique_violation then raise exception 'That username is already taken.';
  end;
  perform public.log_action('member.rename', p_target, jsonb_build_object('changes', array_to_string(sets, ', ')));
end $$;

-- ───────── owner assignment (SQL Editor only; not callable from the app) ─────────
create or replace function public.apply_owner(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; already boolean;
begin
  sid := public.ensure_main_server(p_uid);
  select exists (select 1 from server_members where server_id = sid and user_id = p_uid and role = 'owner') into already;
  perform set_config('app.owner_swap', '1', true);
  update server_members set role = 'admin' where server_id = sid and role = 'owner' and user_id <> p_uid;
  insert into server_members (server_id, user_id, role) values (sid, p_uid, 'owner')
    on conflict (server_id, user_id) do update set role = 'owner', timeout_until = null;
  update servers set owner_id = p_uid where id = sid;
  delete from bans where user_id = p_uid;
  perform set_config('app.owner_swap', '', true);
  if not already then insert into audit_log (actor_id, action, target_user, details) values (null, 'owner.assigned', p_uid, '{"via":"sql setup"}'); end if;
end $$;

-- ───────── Row Level Security ─────────
-- No direct writes to servers / channels / categories / members from the app: everything goes through the checked RPCs above.
drop policy if exists srv_update on public.servers;
drop policy if exists srv_delete on public.servers;
revoke insert, update, delete on public.servers from authenticated, anon;

drop policy if exists cat_write on public.channel_categories;
drop policy if exists ch_write  on public.channels;
drop policy if exists chm_write on public.channel_members;
revoke insert, update, delete on public.channel_categories, public.channels, public.channel_members from authenticated, anon;

drop policy if exists sm_role  on public.server_members;
drop policy if exists sm_leave on public.server_members;
revoke insert, update, delete on public.server_members from authenticated, anon;

-- messages: posting needs can_post (not timed out, channel not locked); deleting others' messages needs the delete_messages permission
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and (
    (conversation_id is not null and public.is_conv_member(conversation_id))
    or (channel_id is not null and public.can_post(channel_id))));
drop policy if exists msg_update on public.messages;
create policy msg_update on public.messages for update to authenticated
  using (author_id = auth.uid() and (channel_id is null or public.can_post(channel_id)))
  with check (author_id = auth.uid());
drop policy if exists msg_delete on public.messages;
create policy msg_delete on public.messages for delete to authenticated using (
  author_id = auth.uid()
  or (channel_id is not null and public.has_perm('delete_messages')));

-- new tables: read-only for the app, and only to the right people
alter table public.bans             enable row level security;
alter table public.role_permissions enable row level security;
alter table public.pinned_messages  enable row level security;
alter table public.reports          enable row level security;
alter table public.audit_log        enable row level security;
revoke all on public.bans, public.role_permissions, public.pinned_messages, public.reports, public.audit_log from anon, authenticated;
grant select on public.role_permissions, public.pinned_messages, public.reports, public.audit_log to authenticated;

drop policy if exists rp_read on public.role_permissions;
create policy rp_read on public.role_permissions for select to authenticated using (server_role(public.main_server()) in ('owner','admin','moderator'));
drop policy if exists pin_read on public.pinned_messages;
create policy pin_read on public.pinned_messages for select to authenticated using (public.can_read_channel(channel_id));
drop policy if exists rep_read on public.reports;
create policy rep_read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.has_perm('view_reports'));
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('view_audit'));

-- ───────── function privileges ─────────
-- internal helpers: not callable from the app at all
revoke execute on function public.log_action(text, uuid, jsonb)        from public, anon, authenticated;
revoke execute on function public.assert_can_act(uuid, text)           from public, anon, authenticated;
revoke execute on function public.apply_owner(uuid)                    from public, anon, authenticated;
revoke execute on function public.hsl_hex(numeric, numeric, numeric)   from public, anon, authenticated;
revoke execute on function public.avatar_color_for(bigint)             from public, anon, authenticated;

-- helpers used by policies and the app
revoke execute on function public.main_server(), public.role_rank(text), public.is_owner(), public.has_perm(text), public.my_permissions(), public.can_post(uuid) from public, anon;
grant  execute on function public.main_server(), public.role_rank(text), public.is_owner(), public.has_perm(text), public.my_permissions(), public.can_post(uuid) to authenticated;

-- app-callable RPCs: signed-in users only (each one re-checks permissions itself)
revoke execute on function public.ensure_avatar_color(), public.admin_list_users(), public.admin_stats() from public, anon;
grant  execute on function public.ensure_avatar_color(), public.admin_list_users(), public.admin_stats() to authenticated;
revoke execute on function public.timeout_user(uuid, int, text), public.kick_user(uuid, text), public.ban_user(uuid, text), public.unban_user(uuid) from public, anon;
grant  execute on function public.timeout_user(uuid, int, text), public.kick_user(uuid, text), public.ban_user(uuid, text), public.unban_user(uuid) to authenticated;
revoke execute on function public.admin_set_role(uuid, text), public.admin_set_permission(text, text, boolean), public.admin_update_server(text, text, text, text, text) from public, anon;
grant  execute on function public.admin_set_role(uuid, text), public.admin_set_permission(text, text, boolean), public.admin_update_server(text, text, text, text, text) to authenticated;
revoke execute on function public.admin_upsert_channel(uuid, text, text, text, uuid, boolean), public.admin_delete_channel(uuid), public.admin_reorder_channels(uuid[]),
  public.admin_set_channel_lock(uuid, boolean), public.admin_set_slow_mode(uuid, int), public.pin_message(uuid, boolean) from public, anon;
grant  execute on function public.admin_upsert_channel(uuid, text, text, text, uuid, boolean), public.admin_delete_channel(uuid), public.admin_reorder_channels(uuid[]),
  public.admin_set_channel_lock(uuid, boolean), public.admin_set_slow_mode(uuid, int), public.pin_message(uuid, boolean) to authenticated;
revoke execute on function public.report_message(uuid, text), public.report_user(uuid, text), public.resolve_report(uuid, text),
  public.admin_set_user_name(uuid, text, text, text, text) from public, anon;
grant  execute on function public.report_message(uuid, text), public.report_user(uuid, text), public.resolve_report(uuid, text),
  public.admin_set_user_name(uuid, text, text, text, text) to authenticated;
grant  execute on function public.ensure_membership() to authenticated;

-- ───────── Realtime: moderation changes reach every open browser instantly (RLS still applies) ─────────
do $rt$
declare t text;
begin
  foreach t in array array['servers','server_members','channels','channel_categories','pinned_messages','profiles','role_permissions','reports','audit_log'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $rt$;

-- ───────── finally: make the configured account the owner ─────────
select public.apply_owner((select value::uuid from public.app_config where key = 'owner_user_id'));
