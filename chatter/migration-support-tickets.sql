-- Chatter: support tickets + the Support Specialist role.
-- Run once in Supabase SQL Editor, AFTER migration-class-roles.sql, migration-role-abilities.sql, migration-role-rules.sql,
-- migration-role-colors.sql and migration-moderation.sql. Safe to re-run. (This replaces migration-support-specialist.sql.)
--
--   * Anyone in the server can open a support ticket and send follow-up replies. Only they and staff can see it.
--   * New ability "support_tickets" (owner can hand it to Admin/Moderator in the permissions table, or to a class role):
--       view every ticket, reply privately, add internal notes (users never see these), mark Open / In progress / Resolved,
--       and escalate a ticket to Moderators.
--   * Moderators (anyone with view_reports) can see, answer and resolve ONLY tickets that were escalated.
--   * It gives no timeout / ban / kick / delete-message / rename / role powers, and nothing here exposes passwords or sign-in data.
--   * The "Support Specialist" role (owner gives it in Admin dashboard > Users) comes from migration-support-role.sql and has just the support_tickets ability.
--   * Everything is checked by the database, not just by the screen.

-- 1. The new ability --------------------------------------------------------------------------------------------------
alter table public.role_permissions drop constraint if exists role_permissions_permission_check;
alter table public.role_permissions add constraint role_permissions_permission_check check (permission = any (array[
  'delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit','manage_moderation','support_tickets']));
insert into public.role_permissions (role, permission, granted)
select r, 'support_tickets', (r = 'admin') from unnest(array['admin','moderator']) r
where not exists (select 1 from public.role_permissions where role = r and permission = 'support_tickets');

alter table public.class_role_permissions drop constraint if exists class_role_permissions_permission_check;
alter table public.class_role_permissions add constraint class_role_permissions_permission_check check (permission = any (array[
  'delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit','support_tickets']));

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
    select cp.permission from class_role_members m join class_role_permissions cp on cp.role_id = m.role_id
      where m.user_id = auth.uid() and m.assigned_by is not null) s), '{}');
end $$;

-- 2. Tables -----------------------------------------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null default 'other' check (category in ('account','login','messages','notifications','profile','other')),
  subject    text not null check (char_length(subject) between 3 and 100),
  status     text not null default 'open' check (status in ('open','in_progress','resolved')),
  escalated  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_updated_idx on public.support_tickets(updated_at desc);
create index if not exists support_tickets_author_idx on public.support_tickets(author_id);

-- kind: reply = visible to the user and staff, note = internal (staff only), system = status log (visible to the user too)
create table if not exists public.support_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.support_tickets(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'reply' check (kind in ('reply','note','system')),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_idx on public.support_ticket_messages(ticket_id, created_at);

-- 3. Who may see / handle a ticket ------------------------------------------------------------------------------------
create or replace function public.ticket_staff(esc boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('support_tickets') or (coalesce(esc, false) and public.has_perm('view_reports')) $$;
revoke execute on function public.ticket_staff(boolean) from public, anon;
grant  execute on function public.ticket_staff(boolean) to authenticated;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets, public.support_ticket_messages from anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;

drop policy if exists tk_read on public.support_tickets;
create policy tk_read on public.support_tickets for select to authenticated
  using (author_id = auth.uid() or public.ticket_staff(escalated));

drop policy if exists tkm_read on public.support_ticket_messages;
create policy tkm_read on public.support_ticket_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = support_ticket_messages.ticket_id
          and ((t.author_id = auth.uid() and support_ticket_messages.kind <> 'note') or public.ticket_staff(t.escalated))));

-- 4. Same word filter as the rest of Chatter (only for what the ticket's author writes; staff notes and replies are not filtered)
create or replace function public.support_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare txt text; r jsonb;
begin
  if to_regprocedure('public.mod_scan(text,text)') is null or to_regclass('public.mod_settings') is null then return new; end if;
  if tg_table_name = 'support_ticket_messages' then
    if new.kind <> 'reply' or not exists (select 1 from public.support_tickets t where t.id = new.ticket_id and t.author_id = new.author_id) then return new; end if;
    txt := new.body;
  else
    txt := new.subject;
  end if;
  if not coalesce((select enabled from public.mod_settings where id = 1), false) then return new; end if;
  r := public.mod_scan(txt, 'chat');
  if r is not null then raise exception '%', public.mod_notice(r, 'ticket'); end if;
  return new;
end $$;
revoke execute on function public.support_guard() from public, anon, authenticated;
drop trigger if exists support_guard_tickets on public.support_tickets;
create trigger support_guard_tickets before insert on public.support_tickets for each row execute function public.support_guard();
drop trigger if exists support_guard_messages on public.support_ticket_messages;
create trigger support_guard_messages before insert on public.support_ticket_messages for each row execute function public.support_guard();

-- 5. Actions ----------------------------------------------------------------------------------------------------------
create or replace function public.ticket_name(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(display_name, ''), username, 'Someone') from profiles where id = uid $$;
revoke execute on function public.ticket_name(uuid) from public, anon, authenticated;

create or replace function public.submit_ticket(p_category text, p_subject text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s text := btrim(coalesce(p_subject, '')); b text := btrim(coalesce(p_body, '')); tid uuid;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if p_category is null or p_category not in ('account','login','messages','notifications','profile','other') then raise exception 'Pick what you need help with.'; end if;
  if char_length(s) < 3 or char_length(s) > 100 then raise exception 'The subject must be 3 to 100 characters.'; end if;
  if char_length(b) < 1 then raise exception 'Tell us what is going on.'; end if;
  if char_length(b) > 2000 then raise exception 'Details can be at most 2000 characters.'; end if;
  if not public.is_owner() then
    if (select count(*) from support_tickets where author_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then raise exception 'You can send up to 5 tickets a day. Reply on an existing ticket instead.'; end if;
    if (select count(*) from support_tickets where author_id = auth.uid() and status <> 'resolved') >= 5 then raise exception 'You already have 5 open tickets. Wait for a reply or reply on one of them.'; end if;
  end if;
  insert into support_tickets (author_id, category, subject) values (auth.uid(), p_category, s) returning id into tid;
  insert into support_ticket_messages (ticket_id, author_id, kind, body) values (tid, auth.uid(), 'reply', b);
  return tid;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; b text := btrim(coalesce(p_body, '')); mine boolean;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  select * into t from support_tickets where id = p_ticket;
  if t.id is null then raise exception 'Ticket not found.'; end if;
  mine := t.author_id = auth.uid();
  if not mine and not public.ticket_staff(t.escalated) then raise exception 'Ticket not found.'; end if;
  if char_length(b) < 1 or char_length(b) > 2000 then raise exception 'A reply must be 1 to 2000 characters.'; end if;
  if mine and not public.is_owner() and (select count(*) from support_ticket_messages where ticket_id = t.id and author_id = auth.uid() and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Slow down a little. Try again in a bit.';
  end if;
  insert into support_ticket_messages (ticket_id, author_id, kind, body) values (t.id, auth.uid(), 'reply', b);
  update support_tickets set updated_at = now(),
    status = case when mine and status = 'resolved' then 'open' when not mine and status = 'open' then 'in_progress' else status end
  where id = t.id;
end $$;

create or replace function public.add_ticket_note(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; b text := btrim(coalesce(p_body, ''));
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or auth.uid() is null or not public.ticket_staff(t.escalated) then raise exception 'Ticket not found.'; end if;
  if char_length(b) < 1 or char_length(b) > 2000 then raise exception 'A note must be 1 to 2000 characters.'; end if;
  insert into support_ticket_messages (ticket_id, author_id, kind, body) values (t.id, auth.uid(), 'note', b);
  update support_tickets set updated_at = now() where id = t.id;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or auth.uid() is null or not public.ticket_staff(t.escalated) then raise exception 'Ticket not found.'; end if;
  if p_status is null or p_status not in ('open','in_progress','resolved') then raise exception 'Pick Open, In progress or Resolved.'; end if;
  if t.status = p_status then return; end if;
  update support_tickets set status = p_status, updated_at = now() where id = t.id;
  insert into support_ticket_messages (ticket_id, author_id, kind, body)
    values (t.id, auth.uid(), 'system', public.ticket_name(auth.uid()) || ' marked this ticket ' || case p_status when 'open' then 'Open' when 'in_progress' then 'In progress' else 'Resolved' end || '.');
  perform public.log_action('ticket.status', t.author_id, jsonb_build_object('subject', left(t.subject, 80), 'status', p_status));
end $$;

-- Support staff hand a serious case (harassment, threats, serious rule-breaking) to Moderators.
create or replace function public.escalate_ticket(p_ticket uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets; why text := btrim(coalesce(p_reason, ''));
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or auth.uid() is null or not public.has_perm('support_tickets') then raise exception 'Ticket not found.'; end if;
  if t.escalated then raise exception 'This ticket is already escalated.'; end if;
  if char_length(why) < 3 or char_length(why) > 500 then raise exception 'Tell the moderators why, in 3 to 500 characters.'; end if;
  update support_tickets set escalated = true, status = case when status = 'open' then 'in_progress' else status end, updated_at = now() where id = t.id;
  insert into support_ticket_messages (ticket_id, author_id, kind, body)
    values (t.id, auth.uid(), 'note', public.ticket_name(auth.uid()) || ' escalated this ticket to moderators: ' || why);
  perform public.log_action('ticket.escalate', t.author_id, jsonb_build_object('subject', left(t.subject, 80)));
end $$;

create or replace function public.delete_ticket(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or auth.uid() is null then raise exception 'Ticket not found.'; end if;
  if not (public.is_owner() or (t.author_id = auth.uid() and t.status = 'resolved')) then raise exception 'You can delete your own tickets once they are resolved.'; end if;
  delete from support_tickets where id = t.id;
end $$;

revoke execute on function public.submit_ticket(text, text, text), public.reply_ticket(uuid, text), public.add_ticket_note(uuid, text),
  public.set_ticket_status(uuid, text), public.escalate_ticket(uuid, text), public.delete_ticket(uuid) from public, anon;
grant  execute on function public.submit_ticket(text, text, text), public.reply_ticket(uuid, text), public.add_ticket_note(uuid, text),
  public.set_ticket_status(uuid, text), public.escalate_ticket(uuid, text), public.delete_ticket(uuid) to authenticated;

-- 6. Live updates -----------------------------------------------------------------------------------------------------
do $rt$ begin alter publication supabase_realtime add table public.support_tickets;         exception when duplicate_object or undefined_object then null; end $rt$;
do $rt$ begin alter publication supabase_realtime add table public.support_ticket_messages; exception when duplicate_object or undefined_object then null; end $rt$;

-- 7. The Support Specialist role is a server role now: run migration-support-role.sql after this file, then set it in
--    Admin dashboard > Users. (It is no longer created as a class role in the Roles tab.)

notify pgrst, 'reload schema';
