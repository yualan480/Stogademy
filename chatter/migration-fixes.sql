-- Chatter: raise attachment limit to 50 MB and restore the system-message bypass. Safe to re-run.
-- Run in Supabase SQL Editor AFTER all other migrations.
-- NOTE: Supabase also has a project-wide cap: Dashboard > Storage > Settings > "Upload file size limit".
-- The free plan allows at most 50 MB; paid plans can go higher (then raise both numbers below and in app.js).

-- 1. Bucket limit: 50 MB per file
update storage.buckets set file_size_limit = 52428800 where id = 'attachments';

-- 2. migration-features.sql overwrote messages_guard and dropped "system messages skip the checks",
--    so welcome messages in the owner-only #welcome channel were silently failing. Put it back.
create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels; sm server_members; wait_s int;
begin
  if tg_op = 'INSERT' then
    if new.is_system then return new; end if;
    if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
      raise exception 'You are sending messages too fast. Wait a few seconds.';
    end if;
    if new.channel_id is not null then
      select * into c from channels where id = new.channel_id;
      select * into sm from server_members where server_id = c.server_id and user_id = new.author_id;
      if sm.user_id is not null then
        if c.owner_only and sm.role <> 'owner' then
          raise exception 'Only the owner can post in #%.', c.name;
        end if;
        if sm.timeout_until is not null and sm.timeout_until > now() then
          raise exception 'You are timed out until %.', to_char(sm.timeout_until at time zone 'utc', 'Mon DD HH24:MI "UTC"');
        end if;
        if c.locked and not (sm.role = 'owner' or public.has_perm('lock_channels')) then
          raise exception 'This channel is locked.';
        end if;
        if c.slow_mode_seconds > 0 and not (sm.role = 'owner' or public.has_perm('slow_mode')) then
          select ceil(c.slow_mode_seconds - extract(epoch from (now() - max(created_at))))::int into wait_s
            from messages where channel_id = new.channel_id and author_id = new.author_id;
          if wait_s is not null and wait_s > 0 then raise exception 'Slow mode is on. Wait % more second(s).', wait_s; end if;
        end if;
      end if;
    end if;
  else
    if new.content is distinct from old.content then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.messages_guard() from public, anon, authenticated;
