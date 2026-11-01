-- Chatter: owner can hand out class roles manually and choose what abilities each role has.
-- Run once in Supabase SQL Editor, AFTER migration-class-roles.sql. Safe to re-run.
--   * Abilities are the same delegable ones Admin/Moderator use (delete messages, timeout, kick, ban, pin, lock, slow mode, ...).
--   * Abilities only apply to people the OWNER assigned the role to. Picking a role yourself never grants abilities.
--   * Owner-assigned roles can't be dropped by the member; only the owner can remove them.
--   * manage_server / manage_roles / manage_names / manage_permissions stay owner-only forever.

-- 1. Who assigned a membership (null = the person picked it themselves).
alter table public.class_role_members add column if not exists assigned_by uuid references public.profiles(id) on delete set null;

-- 2. Abilities per role (a row = granted).
create table if not exists public.class_role_permissions (
  role_id    uuid not null references public.class_roles(id) on delete cascade,
  permission text not null check (permission in ('delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit')),
  primary key (role_id, permission)
);
alter table public.class_role_permissions enable row level security;
revoke all on public.class_role_permissions from anon, authenticated;
grant select on public.class_role_permissions to authenticated;
drop policy if exists crp_read on public.class_role_permissions;
create policy crp_read on public.class_role_permissions for select to authenticated using (true);

-- 3. Membership policies: self-pick only without assigned_by; owner-assigned memberships are removable only by the owner.
drop policy if exists crm_insert on public.class_role_members;
drop policy if exists crm_delete on public.class_role_members;
create policy crm_insert on public.class_role_members for insert to authenticated
  with check (user_id = auth.uid() and assigned_by is null);
create policy crm_delete on public.class_role_members for delete to authenticated
  using ((user_id = auth.uid() and assigned_by is null) or public.is_owner());

-- 4. Owner RPCs.
create or replace function public.admin_set_class_role_member(p_role uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can assign roles.'; end if;
  if not exists (select 1 from class_roles where id = p_role) then raise exception 'Unknown role.'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'User not found.'; end if;
  if coalesce(p_on, false) then
    insert into class_role_members (role_id, user_id, assigned_by) values (p_role, p_user, auth.uid())
      on conflict (role_id, user_id) do update set assigned_by = auth.uid();
  else
    delete from class_role_members where role_id = p_role and user_id = p_user;
  end if;
  perform public.log_action('class_role.assign', p_user, jsonb_build_object('role_id', p_role, 'on', coalesce(p_on, false)));
end $$;

create or replace function public.admin_set_class_role_permission(p_role uuid, p_perm text, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change abilities.'; end if;
  if not exists (select 1 from class_roles where id = p_role) then raise exception 'Unknown role.'; end if;
  if coalesce(p_granted, false) then
    insert into class_role_permissions (role_id, permission) values (p_role, p_perm) on conflict do nothing;
  else
    delete from class_role_permissions where role_id = p_role and permission = p_perm;
  end if;
  perform public.log_action('class_role.permission', null, jsonb_build_object('role_id', p_role, 'permission', p_perm, 'granted', coalesce(p_granted, false)));
end $$;
revoke execute on function public.admin_set_class_role_member(uuid, uuid, boolean), public.admin_set_class_role_permission(uuid, text, boolean) from public, anon;
grant  execute on function public.admin_set_class_role_member(uuid, uuid, boolean), public.admin_set_class_role_permission(uuid, text, boolean) to authenticated;

-- 5. Abilities from owner-assigned class roles count everywhere has_perm() is checked.
create or replace function public.class_role_has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_role_members m join class_role_permissions cp on cp.role_id = m.role_id
                 where m.user_id = auth.uid() and m.assigned_by is not null and cp.permission = p) $$;
revoke execute on function public.class_role_has_perm(text) from public, anon;
grant  execute on function public.class_role_has_perm(text) to authenticated;

create or replace function public.has_perm(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  if p in ('manage_server','manage_roles','manage_names','manage_permissions') then return false; end if;
  if r in ('admin','moderator') and coalesce((select granted from role_permissions where role = r and permission = p), false) then return true; end if;
  return public.class_role_has_perm(p);
end $$;

create or replace function public.my_permissions() returns text[]
language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r = 'owner' then
    return array['delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit',
                 'manage_server','manage_roles','manage_names','manage_permissions'];
  end if;
  return coalesce((select array_agg(distinct x) from (
    select permission as x from role_permissions where r in ('admin','moderator') and role = r and granted
    union
    select cp.permission from class_role_members m join class_role_permissions cp on cp.role_id = m.role_id
      where m.user_id = auth.uid() and m.assigned_by is not null) s), '{}');
end $$;

-- 6. Members with class-role abilities act as moderator-rank: they can act on regular members, never on moderators, admins or the owner.
create or replace function public.assert_can_act(p_target uuid, p_perm text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); my_role text := server_role(main_server()); my_rank int; tr text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not has_perm(p_perm) then raise exception 'You do not have permission to do that.'; end if;
  if p_target = auth.uid() then raise exception 'You cannot do that to yourself.'; end if;
  if not exists (select 1 from profiles where id = p_target) then raise exception 'User not found.'; end if;
  if p_target = (select owner_id from servers where id = sid) then raise exception 'The owner cannot be targeted.'; end if;
  select role into tr from server_members where server_id = sid and user_id = p_target;
  if tr = 'owner' then raise exception 'The owner cannot be targeted.'; end if;
  my_rank := case when my_role = 'member' then 2 else role_rank(my_role) end;
  if tr is not null and my_rank >= role_rank(tr) then
    raise exception 'You can only do that to people ranked below you.';
  end if;
end $$;

-- 7. Live updates.
do $rt$ begin alter publication supabase_realtime add table public.class_role_permissions; exception when duplicate_object or undefined_object then null; end $rt$;
