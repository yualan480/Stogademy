-- PENDING: requires admin SQL access to the ORBIT project qtmrtxgkisshdtqshjre.
-- Requested grant: Grant Lochan Vuppala, +100,000 Orbits. Safe to retry once applied.
begin;
do $$
declare matches integer; recipient uuid; credited integer;
begin
  select count(*), min(p.id::text)::uuid into matches, recipient
  from public.profiles p
  where lower(regexp_replace(btrim(coalesce(p.display_name,'')), '\s+', ' ', 'g')) = 'grant lochan vuppala'
     or lower(regexp_replace(btrim(concat_ws(' ',p.first_name,p.last_name)), '\s+', ' ', 'g')) = 'grant lochan vuppala';
  if matches <> 1 then
    raise exception 'Expected exactly one Grant Lochan Vuppala account; found %. No Orbits credited.', matches;
  end if;
  insert into public.orbit_ledger(user_id,amount,reason,ref)
  values(recipient,100000,'staff_event','owner-grant:grant-lochan-vuppala:100000:2026-11-09')
  on conflict(user_id,reason,ref) do nothing;
  get diagnostics credited = row_count;
  raise notice 'Grant account %, newly credited %, current balance %', recipient, credited*100000, public.game_bal(recipient);
end $$;
commit;
