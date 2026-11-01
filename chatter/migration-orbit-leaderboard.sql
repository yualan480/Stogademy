-- Orbit Leaderboard. Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Orbits come only from staff-verified participation. Messages, comments, clicks and logins never earn Orbits.
create table if not exists public.orbit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount between 1 and 1000),
  reason text not null check (reason in ('event','host_event','challenge','weekly_milestone','tournament')),
  ref text not null,                      -- the event / challenge / week it was earned for
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists orbit_ledger_once on public.orbit_ledger (user_id, reason, ref);   -- no duplicate claims
alter table public.orbit_ledger enable row level security;
drop policy if exists ol_read on public.orbit_ledger;
create policy ol_read on public.orbit_ledger for select to authenticated using (user_id = auth.uid() or public.orbit_staff());

-- staff award Orbits after checking attendance. Event attendance: +50 and +5 per minute (capped at 180 minutes).
create or replace function public.award_orbits(p_user uuid, p_reason text, p_ref text, p_minutes int default 0)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can award Orbits.'; end if;
  if coalesce(btrim(p_ref), '') = '' then raise exception 'Say which event or challenge this is for.'; end if;
  v := case p_reason
    when 'event' then 50 + 5 * least(greatest(coalesce(p_minutes, 0), 0), 180)
    when 'host_event' then 100 when 'challenge' then 25
    when 'weekly_milestone' then 75 when 'tournament' then 100 end;
  if v is null then raise exception 'Unknown reason.'; end if;
  insert into orbit_ledger (user_id, amount, reason, ref) values (p_user, v, p_reason, btrim(p_ref));
  return v;
end $$;

create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint)
language sql stable security definer set search_path = public as $$
  select rank() over (order by sum(l.amount) desc), l.user_id, p.display_name, sum(l.amount)::bigint
  from orbit_ledger l join profiles p on p.id = l.user_id
  where l.created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by l.user_id, p.display_name order by 4 desc limit 50 $$;
revoke all on function public.award_orbits(uuid, text, text, int), public.orbit_leaderboard(int) from public;
grant execute on function public.award_orbits(uuid, text, text, int), public.orbit_leaderboard(int) to authenticated;
