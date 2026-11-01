-- The drifting Orbit: every 5 minutes a coin floats across the Orbit home page; clicking it pays 100 to 1000 Orbits (steps of 50).
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run.
--  * The server picks the amount and enforces the 5-minute gap per account, so editing the page or calling the API directly cannot pay more.
--  * Pays through orbit_ledger (reason 'orbit_drift'), the same balance as everything else.

alter table public.orbit_ledger drop constraint if exists orbit_ledger_reason_check;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason = any (array[
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit','tournament_2nd','tournament_3rd','login_streak','help',
  'bug_report','poll','staff_event','monthly_milestone','member_of_month','game','spend','orbit_drift']));

-- seconds until this account's next coin (0 = one is ready now)
create or replace function public.orbit_drift_wait() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(greatest(0, 300 - extract(epoch from (now() - (select max(created_at) from orbit_ledger where user_id = auth.uid() and reason = 'orbit_drift')))::int), 0)
$$;

-- click the coin: returns the Orbits paid (0 = not ready yet / not allowed)
create or replace function public.claim_orbit_drift() returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); last_at timestamptz; amt int;
begin
  if uid is null or not public.orbit_can_act() then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-drift-' || uid::text));
  select max(created_at) into last_at from orbit_ledger where user_id = uid and reason = 'orbit_drift';
  if last_at is not null and now() - last_at < interval '295 seconds' then return 0; end if;
  amt := 100 + 50 * floor(random() * 19)::int;             -- 100, 150, ... 1000
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, amt, 'orbit_drift', 'drift:' || gen_random_uuid());
  return amt;
end $$;

revoke all on function public.orbit_drift_wait(), public.claim_orbit_drift() from public, anon;
grant execute on function public.orbit_drift_wait(), public.claim_orbit_drift() to authenticated;
