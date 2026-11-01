-- Time on Orbit: +25 per active minute, up to 3,000 a day. Safe to re-run.
create or replace function public.claim_orbit_minute()
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); last_at timestamptz; today_total int; day_start timestamptz := (date_trunc('day', now() at time zone 'utc')) at time zone 'utc';
begin
  if uid is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('orbit-time-' || uid::text));
  select coalesce(sum(amount), 0) into today_total
    from orbit_ledger where user_id = uid and reason = 'time_on_orbit' and created_at >= day_start;
  if today_total >= 3000 then return 0; end if;
  select max(created_at) into last_at from orbit_ledger where user_id = uid and reason = 'time_on_orbit';
  if last_at is not null and now() - last_at < interval '55 seconds' then return 0; end if;
  insert into orbit_ledger (user_id, amount, reason, ref)
    values (uid, 25, 'time_on_orbit', 'min-' || floor(extract(epoch from now()) / 60)::bigint)
    on conflict (user_id, reason, ref) do nothing;
  return 25;
end $$;
revoke all on function public.claim_orbit_minute() from public, anon;
grant execute on function public.claim_orbit_minute() to authenticated;
