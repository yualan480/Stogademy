-- Run after migration-maintenance.sql and migration-moderation.sql.
-- Signup requests are NOT accounts. Approval allows a student to complete signup.
create table if not exists public.signup_requests (
  email text primary key,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
alter table public.signup_requests enable row level security;
revoke all on public.signup_requests from anon, authenticated;

create or replace function public.request_school_signup(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email,''))); old public.signup_requests%rowtype;
begin
  if e !~ '^30[a-z]{2,}[0-9]*@tesdk12\.net$' then
    raise exception 'Use a valid class of 2030 school email.';
  end if;
  if public.lock_exempt(e) or exists(select 1 from public.allowed_emails where email=e) then
    return 'This address can already register. Go back to Create account.';
  end if;
  select * into old from public.signup_requests where email=e for update;
  if found then
    if old.status='approved' then return 'Approved! Go back to Create account.'; end if;
    if old.status='pending' then return 'Your request is pending review.'; end if;
    if old.requested_at > now() - interval '24 hours' then
      return 'A request was already reviewed. Please wait before submitting again.';
    end if;
    update public.signup_requests set status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null where email=e;
  else
    insert into public.signup_requests(email) values(e);
  end if;
  return 'Request submitted. After approval, return here to create your account.';
end $$;
revoke execute on function public.request_school_signup(text) from public;
grant execute on function public.request_school_signup(text) to anon, authenticated;

create or replace function public.admin_list_signup_requests() returns table(email text,status text,requested_at timestamptz,reviewed_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can review signup requests.'; end if;
  return query select r.email,r.status,r.requested_at,r.reviewed_at from public.signup_requests r
    order by case when r.status='pending' then 0 else 1 end, r.requested_at desc limit 500;
end $$;
revoke execute on function public.admin_list_signup_requests() from public,anon;
grant execute on function public.admin_list_signup_requests() to authenticated;

create or replace function public.admin_review_signup_request(p_email text,p_approve boolean) returns void
language plpgsql security definer set search_path=public as $$
declare e text:=lower(trim(coalesce(p_email,'')));
begin
  if not public.is_owner() then raise exception 'Only the owner can review signup requests.'; end if;
  update public.signup_requests set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=now(),reviewed_by=auth.uid() where email=e and status='pending';
  if not found then raise exception 'Pending request not found.'; end if;
  if p_approve then
    insert into public.allowed_emails(email) values(e) on conflict do nothing;
  end if;
  perform public.log_action('signup.review',null,jsonb_build_object('email',e,'approved',p_approve));
end $$;
revoke execute on function public.admin_review_signup_request(text,boolean) from public,anon;
grant execute on function public.admin_review_signup_request(text,boolean) to authenticated;

-- Enforce approval in the database, including when the roster is empty.
create or replace function public.signup_request_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare e text:=lower(trim(coalesce(new.email,'')));
begin
  -- Preserve the existing personal Gmail OAuth flow.
  if coalesce(new.raw_app_meta_data->>'provider','') = 'google'
     and e like '%@gmail.com' then return new; end if;
  if public.lock_exempt(e) then return new; end if;
  if not exists(select 1 from public.allowed_emails where email=e) then
    raise exception 'Your signup request must be approved before creating an account.';
  end if;
  return new;
end $$;
revoke execute on function public.signup_request_guard() from public,anon,authenticated;
drop trigger if exists signup_request_approval_guard on auth.users;
create trigger signup_request_approval_guard before insert on auth.users
  for each row execute function public.signup_request_guard();

-- Mirror the database restriction on the school-email signup screen.
create or replace function public.signup_email_problem(p_email text) returns text
language plpgsql stable security definer set search_path=public as $$
declare e text:=lower(trim(coalesce(p_email,'')));
begin
  if e !~ '^30[a-z]{2,}[0-9]*@tesdk12\\.net$' then
    return 'Use your school email starting with 30 and ending with @tesdk12.net.';
  end if;
  if public.lock_exempt(e) then return null; end if;
  if not exists(select 1 from public.allowed_emails where email=e) then
    return 'Approval required. Select Request access below to send a signup request.';
  end if;
  return null;
end $$;
grant execute on function public.signup_email_problem(text) to anon,authenticated;
