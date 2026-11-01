-- Chatter: one account per device.
-- Run once in Supabase Dashboard > SQL Editor, AFTER migration-owner-admin.sql. Safe to re-run.
-- The first account to sign in on a browser is linked to it. Other accounts are refused on that browser
-- until the owner resets the link (Admin dashboard > Users > "Reset device").

create table if not exists public.device_bindings (
  device_id  uuid primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists device_bindings_user_idx on public.device_bindings(user_id);
alter table public.device_bindings enable row level security;
revoke all on public.device_bindings from anon, authenticated;

create or replace function public.claim_device(p_device uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bound uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_device is null then raise exception 'This device could not be identified.'; end if;
  insert into device_bindings (device_id, user_id) values (p_device, auth.uid()) on conflict (device_id) do nothing;
  select user_id into bound from device_bindings where device_id = p_device;
  if bound is distinct from auth.uid() then
    raise exception 'This device is already linked to a different account. Sign in with the account you used first, or ask the owner to reset it.'
      using hint = 'device_locked';
  end if;
end $$;
revoke execute on function public.claim_device(uuid) from public, anon;
grant  execute on function public.claim_device(uuid) to authenticated;

-- Owner only: forget every device linked to this account so it (or someone else) can sign in there again.
create or replace function public.admin_reset_device(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can reset devices.'; end if;
  delete from device_bindings where user_id = p_target;
  perform public.log_action('member.device_reset', p_target, '{}');
end $$;
revoke execute on function public.admin_reset_device(uuid) from public, anon;
grant  execute on function public.admin_reset_device(uuid) to authenticated;
