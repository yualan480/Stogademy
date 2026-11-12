-- Signup requests: allow server owners, admins, and moderators to review and decide.
-- Run in the Orbit Chat Supabase SQL Editor after migration-signup-requests.sql.
-- Decisions are still checked on the server. Ordinary members and support specialists cannot review.

create or replace function public.admin_list_signup_requests()
returns table(email text, status text, requested_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.server_members sm
    where sm.server_id = public.main_server()
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  ) then
    raise exception 'Only the owner, admins, or moderators can review signup requests.';
  end if;
  return query select r.email, r.status, r.requested_at, r.reviewed_at
    from public.signup_requests r
    order by case when r.status='pending' then 0 else 1 end, r.requested_at desc
    limit 500;
end $$;
revoke execute on function public.admin_list_signup_requests() from public, anon;
grant execute on function public.admin_list_signup_requests() to authenticated;

create or replace function public.admin_review_signup_request(p_email text,p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare e text := lower(trim(coalesce(p_email,'')));
begin
  if auth.uid() is null or not exists (
    select 1 from public.server_members sm
    where sm.server_id = public.main_server()
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  ) then
    raise exception 'Only the owner, admins, or moderators can review signup requests.';
  end if;
  update public.signup_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewed_at=now(), reviewed_by=auth.uid()
  where email=e and status='pending';
  if not found then raise exception 'Pending request not found.'; end if;
  if p_approve then
    insert into public.allowed_emails(email) values(e) on conflict do nothing;
  end if;
  perform public.log_action('signup.review', null, jsonb_build_object(
    'email', e, 'approved', p_approve, 'reviewer_id', auth.uid()
  ));
end $$;
revoke execute on function public.admin_review_signup_request(text,boolean) from public, anon;
grant execute on function public.admin_review_signup_request(text,boolean) to authenticated;
