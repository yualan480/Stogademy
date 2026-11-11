-- Run AFTER migration-school-email-signup.sql and the existing name-lock migration.
-- Adds personal Gmail via Google OAuth only; school password signup stays restricted to 30*.
-- Google display names are user-editable, not verified legal identities. Existing accounts are unchanged.
begin;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email);
        chk jsonb; ren boolean; uname text; fn text; ln text;
        full_name text; personal_google boolean := coalesce(new.raw_app_meta_data->>'provider', '') = 'google' and e ~ '^[^@[:space:]]+@gmail\.com$';
        oauth boolean := coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email';   -- Google/Microsoft sign-in
begin
  if not personal_google and e !~ '^30[a-z]{2,}[0-9]*@tesdk12\.net$' then
    raise exception 'Use your school email starting with 30 and ending with @tesdk12.net.';
  end if;
  if personal_google then
    if coalesce(new.raw_user_meta_data->>'email_verified', 'false') <> 'true' then
      raise exception 'Verify your Gmail address with Google before signing in.';
    end if;
    chk := '{}'::jsonb; -- Personal Gmail accounts do not require the school roster.
  else
    chk := public.mod_signup_check(e, oauth);
  end if;
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
  -- Email/password students supply their names; email confirmation is configured in Auth.
  if not oauth then
    fn := btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'first_name', ''), '\s+', ' ', 'g'));
    ln := btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'last_name', ''), '\s+', ' ', 'g'));
    if fn = '' or ln = '' or char_length(fn) > 20 or char_length(fn || ' ' || ln) > 32
       or fn !~ '^[[:alpha:]][[:alpha:][:space:].’''-]*$'
       or ln !~ '^[[:alpha:]][[:alpha:][:space:].’''-]*$' then
      raise exception 'Enter your first and last names (full name at most 32 characters).';
    end if;
    if public.mod_scan(fn, 'name') is not null or public.mod_scan(ln, 'name') is not null then
      raise exception 'That name needs review. Please contact the site owner.';
    end if;
    ren := false;
  end if;
  if personal_google then
    -- Generated username avoids Gmail punctuation and collisions with school usernames.
    uname := 'gmail_' || substr(replace(new.id::text, '-', ''), 1, 14);
    fn := btrim(coalesce(new.raw_user_meta_data->>'given_name', ''));
    ln := btrim(coalesce(new.raw_user_meta_data->>'family_name', ''));
    if fn = '' then
      full_name := btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), '\s+', ' ', 'g'));
      fn := split_part(full_name, ' ', 1);
      ln := case when position(' ' in full_name) > 0 then btrim(substr(full_name, position(' ' in full_name) + 1)) else '' end;
    end if;
    fn := left(fn, 20); ln := left(ln, greatest(0, 31 - char_length(fn)));
    if fn = '' or public.mod_scan(fn, 'name') is not null or public.mod_scan(ln, 'name') is not null then
      fn := 'New'; ln := 'Member'; ren := true;
    end if;
  end if;
  insert into profiles (id, username, display_name, first_name, last_name, name_status)
  values (new.id, uname, fn || ' ' || ln, fn, ln, case when ren then 'rename_required' else 'ok' end);
  insert into user_notification_settings (user_id) values (new.id);
  if not ex and d is not null then insert into device_bindings (device_id, user_id) values (d, new.id); end if;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
commit;
