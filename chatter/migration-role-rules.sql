-- Chatter: role rules.
-- Run once in Supabase SQL Editor, AFTER migration-class-roles.sql and migration-role-abilities.sql. Safe to re-run.
--   * "Assign-only" roles: people cannot pick them themselves. Only the owner can give them.
--   * "Pick-one" groups: roles that share the same group name are mutually exclusive (e.g. Algebra AB / Algebra BC).
--     A person can pick only one role from a group. If the owner gives someone a role from a group,
--     the person's other role from that group is swapped out automatically.
--   * Both rules are enforced by the database, not just by the screen.

alter table public.class_roles add column if not exists assign_only     boolean not null default false;
alter table public.class_roles add column if not exists exclusive_group text;

alter table public.class_roles drop constraint if exists class_roles_group_ok;
alter table public.class_roles add constraint class_roles_group_ok
  check (exclusive_group is null or (char_length(exclusive_group) between 1 and 40 and exclusive_group ~ '^[[:alnum:]][[:alnum:] &''.+/-]*$'));

-- Tidy group names: trim, collapse spaces, empty = no group.
create or replace function public.class_roles_group_norm() returns trigger
language plpgsql set search_path = public as $$
begin
  new.exclusive_group := nullif(regexp_replace(btrim(coalesce(new.exclusive_group, '')), '\s+', ' ', 'g'), '');
  return new;
end $$;
revoke execute on function public.class_roles_group_norm() from public, anon, authenticated;
drop trigger if exists class_roles_group_norm_trg on public.class_roles;
create trigger class_roles_group_norm_trg before insert or update on public.class_roles
  for each row execute function public.class_roles_group_norm();

-- Self-picks must follow the rules. (Roles the owner hands out through admin_set_class_role_member skip the
-- assign-only check, because the owner is the one allowed to give them.)
create or replace function public.class_role_members_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare ro_assign boolean; ro_group text; clash text;
begin
  if new.assigned_by is not null then return new; end if;
  select assign_only, exclusive_group into ro_assign, ro_group from class_roles where id = new.role_id;
  if coalesce(ro_assign, false) and not public.is_owner() then
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

-- Owner gives or removes a role. Giving a role from a pick-one group swaps out the person's other role from that group.
create or replace function public.admin_set_class_role_member(p_role uuid, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  if not public.is_owner() then raise exception 'Only the owner can assign roles.'; end if;
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
