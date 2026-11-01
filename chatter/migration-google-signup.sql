-- Chatter / Stogademy: let new students create their account automatically by signing in with their school Google account.
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run. (Same function as in migration-moderation.sql, which now has this fix too.)
--
-- Why: the sign-up trigger required a device id that only the email + password form sends, so every first-time Google
-- sign-in was rejected ("Database error saving new user"). Google sign-ins now create the account without one, and the
-- device is linked the first time the person opens Orbit (claim_device). Everything else is unchanged: the school-email
-- format, the approved-email list (if you use one), the name filter and the one-account-per-device rule.
-- Requires migration-moderation.sql to have been run before (it defines mod_signup_check).

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email);
        chk jsonb; ren boolean; uname text; fn text; ln text;
        oauth boolean := coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email';   -- Google/Microsoft sign-in
begin
  chk := public.mod_signup_check(e, oauth);
  if chk->>'problem' is not null then raise exception '%', chk->>'problem'; end if;
  ren := coalesce((chk->>'rename')::boolean, false);
  begin d := (new.raw_user_meta_data->>'device_id')::uuid; exception when others then d := null; end;
  -- Email sign-ups send a device id with the form. Google sign-ins cannot, so for them the account is created without one and
  -- claim_device() links the browser the first time the person opens Orbit (the one-account-per-device rule still applies there).
  if not ex and not (oauth and d is null) then
    if d is null then raise exception 'This device could not be identified. Reload the page and try again.'; end if;
    if exists (select 1 from device_bindings where device_id = d) then
      raise exception 'This device is already linked to a different account.';
    end if;
  end if;
  lp := split_part(e, '@', 1);
  m := regexp_match(lp, '^([0-9]{2})([a-z]+)([a-z])([0-9]*)$');
  if ren then
    uname := 'user' || substr(md5(new.id::text), 1, 8); fn := 'New'; ln := 'Student';      -- neutral placeholder until they pick a name
  else
    uname := lp; fn := upper(m[3]); ln := initcap(m[2]);
  end if;
  insert into profiles (id, username, display_name, first_name, last_name, name_status)
  values (new.id, uname, fn || ' ' || ln, fn, ln, case when ren then 'rename_required' else 'ok' end);
  insert into user_notification_settings (user_id) values (new.id);
  if not ex and d is not null then insert into device_bindings (device_id, user_id) values (d, new.id); end if;
  return new;
end $$;
