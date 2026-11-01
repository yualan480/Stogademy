-- Orbit time reward: every minute spent on Orbit = +5 Orbits. Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Run it after migration-orbit-leaderboard.sql. The app asks once per minute while the tab is visible; the server pays at most one minute per minute.
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.orbit_ledger'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%reason%';
  if c is not null then execute format('alter table public.orbit_ledger drop constraint %I', c); end if;
end $$;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check
  check (reason in ('event','host_event','challenge','weekly_milestone','tournament','time_on_orbit'));

create or replace function public.claim_orbit_minute()
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); last_at timestamptz;
begin
  if uid is null then return 0; end if;
  select max(created_at) into last_at from orbit_ledger where user_id = uid and reason = 'time_on_orbit';
  if last_at is not null and now() - last_at < interval '55 seconds' then return 0; end if;   -- one minute pays once, even with several tabs or devices open
  insert into orbit_ledger (user_id, amount, reason, ref)
    values (uid, 5, 'time_on_orbit', 'min-' || floor(extract(epoch from now()) / 60)::bigint)
    on conflict (user_id, reason, ref) do nothing;
  return 5;
end $$;
revoke all on function public.claim_orbit_minute() from public;
grant execute on function public.claim_orbit_minute() to authenticated;
