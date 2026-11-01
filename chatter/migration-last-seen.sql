-- Orbit "Last online": remembers when each person was last active so offline people show "Last online 3 h ago".
-- Run this once in the Supabase SQL editor. It lives in its own table so the frequent updates never touch the profiles table.
create table if not exists public.profile_seen (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now()
);
alter table public.profile_seen enable row level security;
drop policy if exists "profile_seen readable" on public.profile_seen;
create policy "profile_seen readable" on public.profile_seen for select to authenticated using (true);
revoke all on public.profile_seen from anon, authenticated;
grant select on public.profile_seen to authenticated;

-- each person can only stamp their own row; people who appear offline (invisible) are never stamped
create or replace function public.touch_last_seen() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and status = 'invisible') then return; end if;
  insert into public.profile_seen (user_id, last_seen) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen = now();
end $$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
