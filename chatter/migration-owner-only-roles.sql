-- Chatter: only the owner can add or remove roles on anyone.
-- Run once in Supabase Dashboard > SQL Editor, AFTER the other migrations (especially migration-role-rules.sql). Safe to re-run.
--
--   * Staff roles (admin / moderator / support) were already owner-only (admin_set_role). Nothing changes there.
--   * Class roles (Biology (AP) etc.) could be picked or dropped by each member. Not any more: members can no longer
--     insert or delete rows in class_role_members. Only the owner can, through admin_set_class_role_member.
--   * Roles people already have stay exactly as they are. Only the owner can change them from now on.
--   * Enforced by the database, not just the screen.

drop policy if exists crm_insert on public.class_role_members;
drop policy if exists crm_delete on public.class_role_members;

-- No direct writes from the app for anyone. The owner's function below runs with its own rights and still works.
revoke insert, update, delete on public.class_role_members from authenticated, anon;
grant  select on public.class_role_members to authenticated;

-- Make sure the owner function is the (only) way in, and that it really checks for the owner.
create or replace function public.admin_set_class_role_member(p_role uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  if not public.is_owner() then raise exception 'Only the owner can add or remove roles.'; end if;
  if not exists (select 1 from class_roles where id = p_role) then raise exception 'Unknown role.'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'User not found.'; end if;
  if coalesce(p_on, false) then
    select exclusive_group into g from class_roles where id = p_role;
    if g is not null then
      delete from class_role_members m using class_roles c
       where m.role_id = c.id and m.user_id = p_user and c.id <> p_role and lower(c.exclusive_group) = lower(g);
    end if;
    insert into class_role_members (role_id, user_id, assigned_by) values (p_role, p_user, auth.uid())
      on conflict (role_id, user_id) do update set assigned_by = auth.uid();
  else
    delete from class_role_members where role_id = p_role and user_id = p_user;
  end if;
  perform public.log_action('class_role.assign', p_user, jsonb_build_object('role_id', p_role, 'on', coalesce(p_on, false)));
end $$;
revoke execute on function public.admin_set_class_role_member(uuid, uuid, boolean) from public, anon;
grant  execute on function public.admin_set_class_role_member(uuid, uuid, boolean) to authenticated;

-- Staff roles: restate the owner-only rule so a re-run of an older migration can't loosen it.
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

-- Roles with powers (assign-only, or any ability ticked) can never be self-picked. Self-picked ones never had powers
-- (abilities only count when the owner assigned the role), but they still showed on profiles. Clear those out.
-- Roles the owner assigned are untouched.
delete from public.class_role_members m
 using public.class_roles r
 where m.role_id = r.id and m.assigned_by is null
   and (coalesce(r.assign_only, false)
        or exists (select 1 from public.class_role_permissions cp where cp.role_id = r.id));
