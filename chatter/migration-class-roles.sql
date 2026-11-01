-- Chatter: "Roles" tab. Class roles like Biology (AP) or World History (Honors).
-- Run once in Supabase Dashboard > SQL Editor, AFTER the other migrations. Safe to re-run.
--   * Only the owner can add, rename or delete roles (a role = a subject + an optional level).
--   * Everyone can pick or drop their own roles (at most 12 each). The owner can also remove anyone from a role.
--   * Everyone can see the roles and who has them (they show on profiles and work with @mentions).
-- Names may use letters, numbers, spaces and & ' . + / - (no parentheses: the app adds those around the level).

create table if not exists public.class_roles (
  id         uuid primary key default gen_random_uuid(),
  subject    text not null,
  level      text,
  created_at timestamptz not null default now(),
  constraint class_roles_subject_ok check (char_length(subject) between 1 and 40 and subject ~ '^[[:alnum:]][[:alnum:] &''.+/-]*$'),
  constraint class_roles_level_ok   check (level is null or (char_length(level) between 1 and 20 and level ~ '^[[:alnum:]][[:alnum:] &''.+/-]*$'))
);
-- "Biology"+"AP" and "biology"+"ap" are the same role.
create unique index if not exists class_roles_unique on public.class_roles (lower(subject), lower(coalesce(level, '')));

create table if not exists public.class_role_members (
  role_id    uuid not null references public.class_roles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, user_id)
);
create index if not exists class_role_members_user_idx on public.class_role_members(user_id);

alter table public.class_roles enable row level security;
alter table public.class_role_members enable row level security;
revoke all on public.class_roles, public.class_role_members from anon;
grant select, insert, update, delete on public.class_roles to authenticated;
grant select, insert, delete on public.class_role_members to authenticated;

drop policy if exists cr_read   on public.class_roles;
drop policy if exists cr_insert on public.class_roles;
drop policy if exists cr_update on public.class_roles;
drop policy if exists cr_delete on public.class_roles;
create policy cr_read   on public.class_roles for select to authenticated using (true);
create policy cr_insert on public.class_roles for insert to authenticated with check (public.is_owner());
create policy cr_update on public.class_roles for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy cr_delete on public.class_roles for delete to authenticated using (public.is_owner());

drop policy if exists crm_read   on public.class_role_members;
drop policy if exists crm_insert on public.class_role_members;
drop policy if exists crm_delete on public.class_role_members;
create policy crm_read   on public.class_role_members for select to authenticated using (true);
create policy crm_insert on public.class_role_members for insert to authenticated with check (user_id = auth.uid());
create policy crm_delete on public.class_role_members for delete to authenticated using (user_id = auth.uid() or public.is_owner());

-- Tidy names: trim, collapse spaces, empty level = no level.
create or replace function public.class_roles_norm() returns trigger
language plpgsql set search_path = public as $$
begin
  new.subject := regexp_replace(btrim(new.subject), '\s+', ' ', 'g');
  new.level   := nullif(regexp_replace(btrim(coalesce(new.level, '')), '\s+', ' ', 'g'), '');
  return new;
end $$;
revoke execute on function public.class_roles_norm() from public, anon, authenticated;
drop trigger if exists class_roles_norm_trg on public.class_roles;
create trigger class_roles_norm_trg before insert or update on public.class_roles
  for each row execute function public.class_roles_norm();

-- At most 12 roles per person (the owner is exempt).
create or replace function public.class_role_members_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() and (select count(*) from class_role_members where user_id = new.user_id) >= 12 then
    raise exception 'You can pick at most 12 roles. Drop one first.';
  end if;
  return new;
end $$;
revoke execute on function public.class_role_members_limit() from public, anon, authenticated;
drop trigger if exists class_role_members_limit_trg on public.class_role_members;
create trigger class_role_members_limit_trg before insert on public.class_role_members
  for each row execute function public.class_role_members_limit();

-- Starter roles: Accelerated / Honors / AP for Biology, World History and Spanish. Only added while the list is empty,
-- so roles the owner later deletes never come back when this script is re-run.
do $seed$
begin
  if not exists (select 1 from public.class_roles) then
    insert into public.class_roles (subject, level)
    select s, l from unnest(array['Biology', 'World History', 'Spanish']) s
      cross join unnest(array['Accelerated', 'Honors', 'AP']) l;
  end if;
end $seed$;

-- Live updates in the app (ignored if already added).
do $rt$ begin alter publication supabase_realtime add table public.class_roles;        exception when duplicate_object or undefined_object then null; end $rt$;
do $rt$ begin alter publication supabase_realtime add table public.class_role_members; exception when duplicate_object or undefined_object then null; end $rt$;
