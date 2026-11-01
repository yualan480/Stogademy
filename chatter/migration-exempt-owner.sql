-- Chatter: exempt 30yua@tesdk12.net from the device lock and the login lockout. Safe to re-run.

create or replace function public.lock_exempt(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select lower(trim(coalesce(p_email, ''))) = '30yua@tesdk12.net' $$;
revoke execute on function public.lock_exempt(text) from public, anon, authenticated;

-- Device lock: exempt accounts are never linked to a device and can sign in anywhere.
create or replace function public.claim_device(p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bound uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if public.lock_exempt((select email from auth.users where id = auth.uid())) then return; end if;
  if p_device is null then raise exception 'This device could not be identified.'; end if;
  insert into device_bindings (device_id, user_id) values (p_device, auth.uid()) on conflict (device_id) do nothing;
  select user_id into bound from device_bindings where device_id = p_device;
  if bound is distinct from auth.uid() then
    raise exception 'This device is already linked to a different account. Sign in with the account you used first, or ask the owner to reset it.'
      using hint = 'device_locked';
  end if;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email);
begin
  if e !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' then
    raise exception 'Only school email addresses (like 30yua@tesdk12.net) can sign up.';
  end if;
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

-- Login lockout: exempt accounts never accumulate failures or get locked.
create or replace function public.login_lock_status(p_email text) returns int
language sql stable security definer set search_path = public as $$
  select case when public.lock_exempt(p_email) then 0 else
    coalesce((select greatest(0, ceil(extract(epoch from (locked_until - now())))::int)
              from login_attempts where email = lower(trim(p_email)) and locked_until > now()), 0) end $$;

create or replace function public.login_record_failure(p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, ''))); f int; l timestamptz;
begin
  if public.lock_exempt(e) then return jsonb_build_object('fails', 0, 'locked', 0); end if;
  if e !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' or length(e) > 100 then return jsonb_build_object('fails', 0, 'locked', 0); end if;
  delete from login_attempts where last_fail < now() - interval '1 day';
  select locked_until into l from login_attempts where email = e;
  if l is not null and l > now() then
    return jsonb_build_object('fails', 3, 'locked', ceil(extract(epoch from (l - now())))::int);
  end if;
  insert into login_attempts as a (email, fails, last_fail) values (e, 1, now())
  on conflict (email) do update set
    fails = case when a.locked_until is not null and a.locked_until <= now() then 1
                 when a.last_fail < now() - interval '15 minutes' then 1
                 else a.fails + 1 end,
    last_fail = now(),
    locked_until = null
  returning fails into f;
  if f >= 3 then
    update login_attempts set locked_until = now() + interval '15 minutes' where email = e;
    return jsonb_build_object('fails', f, 'locked', 900);
  end if;
  return jsonb_build_object('fails', f, 'locked', 0);
end $$;

-- Clean up anything already recorded for the exempt account.
delete from public.login_attempts where public.lock_exempt(email);
delete from public.device_bindings where user_id in (select id from auth.users where public.lock_exempt(email));
