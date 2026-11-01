-- Chatter: Support Specialist becomes a real server role, set in Admin dashboard > Users (next to admin / moderator / member).
-- Run once in Supabase SQL Editor, AFTER migration-support-tickets.sql. Safe to re-run.
--
--   * New server role "support". Only the owner can give it or take it away (same as admin / moderator).
--   * It carries exactly ONE ability, support_tickets (see every ticket, reply, add internal notes, set status, escalate).
--     It gives no timeout / ban / kick / delete / rename / role powers, and no access to the moderation parts of the dashboard.
--   * The old "Support Specialist" class role (the one shown in the Roles tab) is converted: everyone the owner had given it to
--     becomes a Support Specialist, then the class role is removed from the Roles tab.
--   * Everything is checked by the database, not just by the screen.

-- 1. Allow the new role value ---------------------------------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.server_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.server_members drop constraint %I', c); end loop;
end $$;
alter table public.server_members add constraint server_members_role_check check (role in ('owner','admin','moderator','support','member'));

drop policy if exists sm_role on public.server_members;
create policy sm_role on public.server_members for update to authenticated
  using (public.server_role(server_id) = 'owner' and role <> 'owner')
  with check (role in ('admin','moderator','support','member'));

-- 2. Only the owner can set it (admin_set_role is the only way the app changes a role) -------------------------------------
create or replace function public.admin_set_role(p_target uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := main_server(); old_role text;
begin
  if not public.is_owner() then raise exception 'Only the owner can change roles.'; end if;
  if p_role not in ('admin','moderator','support','member') then raise exception 'Role must be admin, moderator, support specialist or member.'; end if;
  if p_target = auth.uid() then raise exception 'You cannot change your own role.'; end if;
  select role into old_role from server_members where server_id = sid and user_id = p_target;
  if old_role is null then raise exception 'That user is not in the server.'; end if;
  if old_role = 'owner' then raise exception 'The owner''s role cannot be changed.'; end if;
  update server_members set role = p_role where server_id = sid and user_id = p_target;
  perform public.log_action('member.role', p_target, jsonb_build_object('from', old_role, 'to', p_role));
end $$;

-- 3. The role's one ability --------------------------------------------------------------------------------------------------
create or replace function public.has_perm(p text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r is null then return false; end if;
  if r = 'owner' then return true; end if;
  if p in ('manage_server','manage_roles','manage_names','manage_permissions') then return false; end if;
  if r = 'support' and p = 'support_tickets' then return true; end if;
  if r in ('admin','moderator') and coalesce((select granted from role_permissions where role = r and permission = p), false) then return true; end if;
  return public.class_role_has_perm(p);
end $$;

create or replace function public.my_permissions() returns text[] language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r = 'owner' then
    return array['delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit',
                 'manage_moderation','support_tickets','manage_server','manage_roles','manage_names','manage_permissions'];
  end if;
  return coalesce((select array_agg(distinct x) from (
    select permission as x from role_permissions where r in ('admin','moderator') and role = r and granted
    union
    select 'support_tickets' where r = 'support'
    union
    select cp.permission from class_role_members m join class_role_permissions cp on cp.role_id = m.role_id
      where m.user_id = auth.uid() and m.assigned_by is not null) s), '{}');
end $$;

revoke execute on function public.admin_set_role(uuid, text), public.has_perm(text), public.my_permissions() from public, anon;
grant  execute on function public.admin_set_role(uuid, text), public.has_perm(text), public.my_permissions() to authenticated;

-- 4. Move the old class role over, then take it out of the Roles tab --------------------------------------------------------
do $$
declare rid uuid; sid uuid := public.main_server();
begin
  select id into rid from public.class_roles where lower(subject) = 'support specialist' and level is null;
  if rid is not null then
    -- only people the owner assigned it to (assigned_by is set), and only if they are plain members (never demote staff)
    update public.server_members sm set role = 'support'
      where sm.server_id = sid and sm.role = 'member'
        and sm.user_id in (select user_id from public.class_role_members where role_id = rid and assigned_by is not null);
    delete from public.class_roles where id = rid;   -- members and abilities of the class role go with it
  end if;
end $$;

notify pgrst, 'reload schema';
