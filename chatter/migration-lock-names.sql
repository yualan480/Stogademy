-- Orbit: every account's first and last name come from the school account they sign in with, and are then locked.
-- Run this once in Supabase > SQL Editor (after the other migrations). Safe to run again.
--
--  * lock_account_name()  : called by Orbit when someone opens it. Copies the first/last name from the account (Google/Microsoft
--                           profile) into the Orbit profile, then locks it. Accounts with no name on them (plain email sign-ups)
--                           keep the name made from their school email, and that gets locked instead.
--                           A name that fails the name filter is not copied (the person is asked to pick one, as before).
--  * change_first_name()  : no longer works (it used to let people edit their first name).
--  * profiles trigger     : once locked, first/last/display name can only be changed by the owner (Admin > rename), the moderation
--                           "name needs changing" flow, or the SQL editor.

alter table public.profiles add column if not exists name_locked boolean not null default false;

create or replace function public.lock_account_name() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); md jsonb; fn text; ln text; full_name text; pr profiles%rowtype; bad boolean := false;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into pr from profiles where id = uid;
  if not found then raise exception 'Profile missing.'; end if;
  if pr.name_locked or pr.name_status = 'rename_required' then return jsonb_build_object('ok', true, 'profile', to_jsonb(pr)); end if;

  select raw_user_meta_data into md from auth.users where id = uid;
  fn := btrim(coalesce(md->>'given_name', md->>'first_name', ''));
  ln := btrim(coalesce(md->>'family_name', md->>'last_name', ''));
  if fn = '' and ln = '' then
    full_name := btrim(regexp_replace(coalesce(md->>'full_name', md->>'name', ''), '\s+', ' ', 'g'));
    if position(' ' in full_name) > 0 then
      fn := split_part(full_name, ' ', 1); ln := btrim(substr(full_name, position(' ' in full_name) + 1));
    else
      fn := full_name;
    end if;
  end if;
  fn := left(fn, 20);
  ln := left(ln, greatest(0, 31 - char_length(fn)));   -- display name is "first last", at most 32 characters

  begin
    if fn <> '' and (public.mod_scan(fn, 'name') is not null or (ln <> '' and public.mod_scan(ln, 'name') is not null)) then bad := true; end if;
  exception when undefined_function then null;          -- moderation migration not installed: nothing to check
  end;

  if fn = '' or bad then
    update profiles set name_locked = true where id = uid returning * into pr;     -- keep the current name, just lock it
  else
    perform set_config('app.name_reset', '1', true);
    update profiles set first_name = fn, last_name = ln, name_locked = true where id = uid returning * into pr;
    perform set_config('app.name_reset', '', true);
  end if;
  return jsonb_build_object('ok', true, 'profile', to_jsonb(pr));
end $$;
revoke execute on function public.lock_account_name() from public, anon;
grant execute on function public.lock_account_name() to authenticated;

create or replace function public.change_first_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Your name comes from your school account and can''t be changed.';
end $$;

create or replace function public.profiles_lock_names() returns trigger
language plpgsql security definer set search_path = public as $$
declare reset boolean := coalesce(current_setting('app.name_reset', true), '') = '1';
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if reset then new.name_locked := true; return new; end if;                       -- choosing a name after the filter asked for one: lock the new one
  if new.name_status = 'rename_required' and old.name_status is distinct from 'rename_required' then
    new.name_locked := false; return new;                                            -- moderation asked for a new name: let them pick one
  end if;
  if old.name_locked and auth.uid() is not null and not coalesce(public.is_owner(), false)
     and (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.display_name is distinct from old.display_name) then
    raise exception 'Your name comes from your school account and can''t be changed.';
  end if;
  if old.name_locked and not new.name_locked and auth.uid() is not null and not coalesce(public.is_owner(), false) then new.name_locked := true; end if;
  return new;
end $$;
revoke execute on function public.profiles_lock_names() from public, anon, authenticated;
drop trigger if exists profiles_lock_names_trg on public.profiles;
create trigger profiles_lock_names_trg before update on public.profiles
  for each row execute function public.profiles_lock_names();
