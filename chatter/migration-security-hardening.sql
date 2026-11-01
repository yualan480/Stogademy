-- Chatter: security hardening. Run once in Supabase SQL Editor, AFTER the other migrations. Safe to re-run.

-- 1. Trigger functions are only meant to run as triggers: remove them from the public API entirely.
revoke execute on function public.handle_new_user(), public.friend_request_guard(), public.guard_email_change(),
  public.messages_after_insert(), public.messages_audit_del(), public.messages_guard(),
  public.profiles_assign_color(), public.server_members_guard() from public, anon, authenticated;

-- 2. Helper/RPC functions: signed-in users only (nothing here needs to work for logged-out visitors).
revoke execute on function public.can_read_channel(uuid), public.ensure_membership(), public.is_admin(uuid),
  public.is_conv_member(uuid), public.is_staff(uuid), public.server_role(uuid), public.start_dm(uuid),
  public.username_available(text), public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.can_read_channel(uuid), public.ensure_membership(), public.is_admin(uuid),
  public.is_conv_member(uuid), public.is_staff(uuid), public.server_role(uuid), public.start_dm(uuid),
  public.username_available(text), public.respond_friend_request(uuid, boolean) to authenticated;

-- 3. Pin the search_path of the three helper functions that had none.
alter function public.role_rank(text)                      set search_path = public;
alter function public.avatar_color_for(bigint)             set search_path = public;
alter function public.hsl_hex(numeric, numeric, numeric)   set search_path = public;

-- 4. Table privileges: logged-out visitors get nothing; signed-in users lose rights RLS can't police.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- 5. Only the owner can change a username (the app already says names can't be edited; now the database agrees).
create or replace function public.profiles_lock_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_owner() then
    new.id := old.id; new.created_at := old.created_at;
    if new.username is distinct from old.username then raise exception 'Usernames cannot be changed.'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.profiles_lock_identity() from public, anon, authenticated;
drop trigger if exists profiles_lock_identity_trg on public.profiles;
create trigger profiles_lock_identity_trg before update on public.profiles
  for each row execute function public.profiles_lock_identity();
