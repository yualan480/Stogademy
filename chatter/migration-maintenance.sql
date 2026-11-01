-- Chatter: maintenance mode (owner button + message) and an approved-email roster for sign-ups.
-- Run this once in the Supabase SQL Editor, then reload Chatter. Safe to re-run.

-- ───────── 1. Maintenance mode ─────────
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  maintenance_message text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to anon, authenticated using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;   -- read-only; only admin_set_maintenance() can change it

do $rt$ begin alter publication supabase_realtime add table public.app_settings; exception when duplicate_object or undefined_object then null; end $rt$;

create or replace function public.admin_set_maintenance(p_on boolean, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change maintenance mode.'; end if;
  p_message := left(trim(coalesce(p_message, '')), 300);
  if coalesce(p_on, false) and p_message = '' then p_message := 'Chatter is down for maintenance. We will be back soon.'; end if;
  update app_settings set maintenance = coalesce(p_on, false), maintenance_message = p_message, updated_at = now() where id = 1;
  perform public.log_action(case when coalesce(p_on, false) then 'maintenance.on' else 'maintenance.off' end, null, jsonb_build_object('message', p_message));
end $$;
revoke execute on function public.admin_set_maintenance(boolean, text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean, text) to authenticated;

-- While maintenance is on, only the owner can send messages (the app also shows everyone else a maintenance screen).
create or replace function public.maintenance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select maintenance from app_settings where id = 1), false) and not public.is_owner() then
    raise exception 'Chatter is down for maintenance right now. Please try again later.';
  end if;
  return new;
end $$;
revoke execute on function public.maintenance_guard() from public, anon, authenticated;
drop trigger if exists maintenance_block_messages on public.messages;
create trigger maintenance_block_messages before insert on public.messages
  for each row execute function public.maintenance_guard();

-- ───────── 2. Approved-email roster ─────────
-- Accounts don't need a confirmation email, so this is how Chatter checks an address is a real one:
-- when the owner has put addresses on the roster, only those addresses can create an account.
-- An empty roster means no restriction beyond the school-email format.
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;   -- no policies: only the functions below touch it

-- Returns null when the address may sign up, otherwise the message to show. Safe to call before signing up.
create or replace function public.signup_email_problem(p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' then
    return 'Only school email addresses (like 30yua@tesdk12.net) can sign up.';
  end if;
  if public.lock_exempt(e) then return null; end if;
  if exists (select 1 from allowed_emails) and not exists (select 1 from allowed_emails where email = e) then
    return 'That email is not on the approved school list. Check for typos, or ask the owner to add it.';
  end if;
  return null;
end $$;
grant execute on function public.signup_email_problem(text) to anon, authenticated;

create or replace function public.admin_get_allowed_emails() returns text[]
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see the approved email list.'; end if;
  return coalesce((select array_agg(email order by email) from allowed_emails), '{}');
end $$;
revoke execute on function public.admin_get_allowed_emails() from public, anon;
grant execute on function public.admin_get_allowed_emails() to authenticated;

-- Replaces the whole roster with the given list (an empty list turns the roster off).
create or replace function public.admin_set_allowed_emails(p_emails text[]) returns int
language plpgsql security definer set search_path = public as $$
declare clean text[]; bad text; n int;
begin
  if not public.is_owner() then raise exception 'Only the owner can change the approved email list.'; end if;
  select coalesce(array_agg(distinct lower(trim(x))) filter (where trim(x) <> ''), '{}') into clean from unnest(coalesce(p_emails, '{}')) as x;
  if coalesce(array_length(clean, 1), 0) > 5000 then raise exception 'The list is limited to 5000 emails.'; end if;
  select x into bad from unnest(clean) as x where x !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' limit 1;
  if bad is not null then raise exception 'Not a school email: %', left(bad, 80); end if;
  delete from allowed_emails where true;
  insert into allowed_emails (email) select unnest(clean);
  n := coalesce(array_length(clean, 1), 0);
  perform public.log_action('roster.update', null, jsonb_build_object('emails', n));
  return n;
end $$;
revoke execute on function public.admin_set_allowed_emails(text[]) from public, anon;
grant execute on function public.admin_set_allowed_emails(text[]) to authenticated;

-- Sign-up now also checks the roster (same function as before, plus the roster check; the owner is always allowed).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email); prob text;
begin
  prob := public.signup_email_problem(e);
  if prob is not null then raise exception '%', prob; end if;
  begin d := (new.raw_user_meta_data->>'device_id')::uuid; exception when others then d := null; end;
  if not ex then
    if d is null then raise exception 'This device could not be identified. Reload the page and try again.'; end if;
    if exists (select 1 from device_bindings where device_id = d) then
      raise exception 'This device is already linked to a different account.';
    end if;
  end if;
  lp := split_part(e, '@', 1);
  m := regexp_match(lp, '^([0-9]{2})([a-z]+)([a-z])([0-9]*)$');
  insert into profiles (id, username, display_name, first_name, last_name)
  values (new.id, lp, upper(m[3]) || ' ' || initcap(m[2]), upper(m[3]), initcap(m[2]));
  insert into user_notification_settings (user_id) values (new.id);
  if not ex then insert into device_bindings (device_id, user_id) values (d, new.id); end if;
  return new;
end $$;
