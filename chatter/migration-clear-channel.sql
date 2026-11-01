-- Clear a channel: the owner, admins and moderators can delete every message in one text channel with a single action.
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run. Run it after migration-owner-admin.sql and migration-gifts-channels.sql.
--
--  * Everything is checked here, not in the page: the role, the channel, and the two channels that can never be cleared.
--  * Suggestions and Tutorials are never cleared. They are special channels (channels.special = 'suggestions' / 'videos'); a channel named
--    "suggestions" or "tutorials" is protected too, so renaming or re-flagging can't open a loophole.
--  * Only that one channel is touched. The channel itself, its settings and its permissions stay as they are.
--  * The audit log gets ONE entry ("channel.clear", who, which channel, how many messages) instead of one per deleted message.
--  * Open Orbit gifts in a cleared channel are refunded, exactly as when a single gift message is deleted.

-- the per-message audit entry is skipped while a clear is running (one summary entry is written instead)
create or replace function public.messages_audit_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare cname text;
begin
  if coalesce(current_setting('orbit.clearing', true), '') = '1' then return old; end if;
  if auth.uid() is not null and old.channel_id is not null and old.author_id <> auth.uid()
     and exists (select 1 from profiles where id = old.author_id) then
    select name into cname from channels where id = old.channel_id;
    if cname is not null then   -- null means the whole channel is being deleted (logged separately)
      perform public.log_action('message.delete', old.author_id, jsonb_build_object('channel', cname, 'content', left(old.content, 200)));
    end if;
  end if;
  return old;
end $$;
revoke execute on function public.messages_audit_del() from public, anon, authenticated;

create or replace function public.clear_channel(p_channel uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c channels; n int;
begin
  if auth.uid() is null then raise exception 'Log in to Orbit first.'; end if;
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can clear a channel.'; end if;
  select * into c from channels where id = p_channel and server_id = public.main_server();
  if c.id is null then raise exception 'Channel not found.'; end if;
  if c.kind <> 'text' then raise exception 'Only text channels can be cleared.'; end if;
  if coalesce(c.special, '') <> '' or lower(btrim(c.name)) in ('suggestions', 'tutorials') then
    raise exception 'The Suggestions and Tutorials channels can''t be cleared.'; end if;
  perform set_config('orbit.clearing', '1', true);   -- this transaction only
  delete from messages where channel_id = c.id;
  get diagnostics n = row_count;
  perform public.log_action('channel.clear', null, jsonb_build_object('channel', c.name, 'messages', n));
  return n;
end $$;
revoke all on function public.clear_channel(uuid) from public, anon;
grant execute on function public.clear_channel(uuid) to authenticated;
