-- Chatter: class role colours, one colour per subject (every level of a subject shares it). The owner can change them.
-- Run once in Supabase SQL Editor, AFTER migration-class-roles.sql. Safe to re-run (re-running resets every subject to its palette colour).
alter table public.class_roles add column if not exists color text;
alter table public.class_roles drop constraint if exists class_roles_color_ok;
alter table public.class_roles add constraint class_roles_color_ok check (color is null or color ~ '^#[0-9a-f]{6}$');

create or replace function public.class_role_palette() returns text[]
language sql immutable set search_path = public as $$
  select array['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1','#a855f7','#ec4899','#84cc16','#f43f5e','#0ea5e9','#d946ef','#f59e0b','#10b981'] $$;

update public.class_roles r set color = (public.class_role_palette())[1 + ((x.n - 1) % 16)]
from (select lower(subject) s, row_number() over (order by lower(subject)) n from (select distinct subject from public.class_roles) d) x
where lower(r.subject) = x.s;

create or replace function public.class_roles_norm() returns trigger
language plpgsql set search_path = public as $$
begin
  new.subject := regexp_replace(btrim(new.subject), '\s+', ' ', 'g');
  new.level   := nullif(regexp_replace(btrim(coalesce(new.level, '')), '\s+', ' ', 'g'), '');
  new.color   := lower(nullif(btrim(coalesce(new.color, '')), ''));
  if new.color is null then
    new.color := coalesce(
      (select color from public.class_roles where lower(subject) = lower(new.subject) and color is not null limit 1),
      (public.class_role_palette())[1 + ((select count(distinct lower(subject)) from public.class_roles)::int % 16)]);
  end if;
  return new;
end $$;
revoke execute on function public.class_roles_norm() from public, anon, authenticated;
