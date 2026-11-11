-- Run after the existing signup and name-lock migrations. Safe to re-run.
-- School password signup derives names from the email; personal Google names are preserved.
-- Adds personal Gmail via Google OAuth only; school password signup stays restricted to 30*.
-- Google display names are user-editable, not verified legal identities. Existing accounts are unchanged.
begin;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email);
        chk jsonb; ren boolean; uname text; fn text; ln text;
        full_name text; personal_google boolean := coalesce(new.raw_app_meta_data->>'provider', '') = 'google' and e ~ '^[^@[:space:]]+@gmail\.com$';
        oauth boolean := coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email';   -- Google/Microsoft sign-in
begin
  if oauth and not personal_google then
    raise exception 'Use a personal @gmail.com account with Continue with Google. For school email, use email and password.';
  end if;
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
  -- Derive school password-signup names on the server, ignoring supplied names.
  if not oauth then
    fn := upper(m[3]); ln := initcap(m[2]);
    if char_length(ln) > 30 then raise exception 'The name in this school email is too long.'; end if;
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
create or replace function public.lock_account_name() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); md jsonb; fn text; ln text; full_name text; pr profiles%rowtype; bad boolean := false; account_email text; account_provider text; email_parts text[];
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into pr from profiles where id = uid;
  if not found then raise exception 'Profile missing.'; end if;
  if pr.name_locked or pr.name_status = 'rename_required' then return jsonb_build_object('ok', true, 'profile', to_jsonb(pr)); end if;

  select raw_user_meta_data, email, raw_app_meta_data->>'provider' into md, account_email, account_provider from auth.users where id = uid;
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
  if coalesce(account_provider, 'email') = 'email' then
    email_parts := regexp_match(lower(account_email), '^30([a-z]+)([a-z])[0-9]*@tesdk12\.net$');
    if email_parts is not null then fn := upper(email_parts[2]); ln := initcap(email_parts[1]); end if;
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


commit;
