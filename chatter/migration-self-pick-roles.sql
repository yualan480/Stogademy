-- Chatter: members choose their own class roles again; roles with abilities stay owner-only.
-- Run once in Supabase SQL Editor, AFTER migration-owner-only-roles.sql (it replaces that script's lock). Safe to re-run.
--   * Anyone can pick or drop their own roles, as long as the role has NO abilities and is not "assign-only".
--   * Roles with any ability ticked (delete messages, timeout, ban, ...) can only be given or removed by the owner
--     (admin_set_class_role_member). Enforced by the database, not just the screen.
--   * Roles the owner gave someone can only be removed by the owner.
--   * If the owner later ticks an ability on a role, everyone who picked it themselves loses it (owner-given ones stay).

grant select, insert, delete on public.class_role_members to authenticated;
revoke update on public.class_role_members from authenticated, anon;

drop policy if exists crm_insert on public.class_role_members;
drop policy if exists crm_delete on public.class_role_members;
create policy crm_insert on public.class_role_members for insert to authenticated
  with check (user_id = auth.uid() and assigned_by is null
              and not exists (select 1 from public.class_role_permissions cp where cp.role_id = class_role_members.role_id)
              and not coalesce((select r.assign_only from public.class_roles r where r.id = class_role_members.role_id), false));
create policy crm_delete on public.class_role_members for delete to authenticated
  using ((user_id = auth.uid() and assigned_by is null) or public.is_owner());

-- Belt and braces: the pick-rules trigger also refuses ability roles.
create or replace function public.class_role_members_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare ro_assign boolean; ro_group text; clash text;
begin
  if new.assigned_by is not null then return new; end if;
  select assign_only, exclusive_group into ro_assign, ro_group from class_roles where id = new.role_id;
  if (coalesce(ro_assign, false) or exists (select 1 from class_role_permissions where role_id = new.role_id)) and not public.is_owner() then
    raise exception 'Only the owner can give you that role.';
  end if;
  if ro_group is not null then
    select c.subject || coalesce(' (' || c.level || ')', '') into clash
      from class_role_members m join class_roles c on c.id = m.role_id
     where m.user_id = new.user_id and c.id <> new.role_id and lower(c.exclusive_group) = lower(ro_group)
     limit 1;
    if clash is not null then
      raise exception 'You can only pick one of these roles. Drop % first.', clash;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.class_role_members_rules() from public, anon, authenticated;
drop trigger if exists class_role_members_rules_trg on public.class_role_members;
create trigger class_role_members_rules_trg before insert on public.class_role_members
  for each row execute function public.class_role_members_rules();

-- When the owner gives a role an ability, self-picked memberships of it are removed.
create or replace function public.class_role_perm_clear_picks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from class_role_members where role_id = new.role_id and assigned_by is null;
  return new;
end $$;
revoke execute on function public.class_role_perm_clear_picks() from public, anon, authenticated;
drop trigger if exists class_role_perm_clear_picks_trg on public.class_role_permissions;
create trigger class_role_perm_clear_picks_trg after insert on public.class_role_permissions
  for each row execute function public.class_role_perm_clear_picks();

-- One-time cleanup: self-picked memberships of roles that already have abilities.
delete from public.class_role_members m
 using public.class_roles r
 where m.role_id = r.id and m.assigned_by is null
   and (coalesce(r.assign_only, false) or exists (select 1 from public.class_role_permissions cp where cp.role_id = r.id));
