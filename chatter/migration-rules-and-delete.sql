-- ═══════════════════════════════════════════════════════════════════════════
-- Chatter: (1) the #rules channel is admin-edited only, (2) owner can delete accounts.
-- Run AFTER migration-moderation.sql. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. #rules: marked as a rules channel. Only the owner and admins can post, edit or delete there
--    (moderators and members cannot, even if they have the "delete messages" permission).
alter table channels add column if not exists is_rules boolean not null default false;
update channels set is_rules = true, owner_only = true, admins_can_post = true, mods_can_post = false,
       description = 'Server rules. Only admins can edit.'
 where kind = 'text' and lower(name) = 'rules';

alter policy msg_delete on messages using (
  case when channel_id is not null and exists (select 1 from channels c where c.id = messages.channel_id and c.is_rules)
       then server_role(main_server()) in ('owner', 'admin')
       else (author_id = auth.uid()) or (channel_id is not null and has_perm('delete_messages')) end);

create or replace function edit_message(p_id uuid, p_content text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m messages%rowtype; v jsonb; rules boolean := false;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into m from messages where id = p_id and not is_system for update;
  if not found then raise exception 'Message not found.'; end if;
  if m.channel_id is not null then select coalesce(c.is_rules, false) into rules from channels c where c.id = m.channel_id; end if;
  if rules then
    if server_role(main_server()) not in ('owner', 'admin') then raise exception 'Only admins can edit the rules.'; end if;
  elsif m.author_id <> uid then
    raise exception 'Message not found.';
  end if;
  if m.channel_id is not null and not can_post(m.channel_id) then raise exception 'You can''t edit messages in this channel right now.'; end if;
  p_content := coalesce(p_content, '');
  if char_length(p_content) = 0 and jsonb_array_length(m.attachments) = 0 then raise exception 'A message can''t be empty.'; end if;
  if m.conversation_id is null or coalesce((select filter_dms from mod_settings where id = 1), true) then
    v := mod_enforce(uid, case when m.conversation_id is not null then 'dm_edit' else 'edit' end, p_content);
    if v is not null then return v; end if;
  end if;
  update messages set content = p_content where id = p_id returning * into m;
  return to_jsonb(m);
end $$;

-- 2. Owner-only: permanently delete an account (sign-in, profile, messages, friends, everything tied to it).
create or replace function admin_delete_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pr profiles%rowtype;
begin
  if not is_owner() then raise exception 'Only the owner can delete accounts.'; end if;
  if p_target is null or p_target = auth.uid() then raise exception 'You can''t delete your own account.'; end if;
  select * into pr from profiles where id = p_target;
  if not found then raise exception 'That account no longer exists.'; end if;
  if exists (select 1 from server_members where user_id = p_target and role = 'owner') or exists (select 1 from servers where owner_id = p_target) then
    raise exception 'The owner account can''t be deleted.';
  end if;
  perform log_action('user.delete', null, jsonb_build_object('username', pr.username, 'name', pr.display_name));
  delete from server_invites where created_by = p_target;
  delete from auth.users where id = p_target;
end $$;

revoke execute on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;
