-- ===== Unique player names + every name visible in the admin "Users" tab =====
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. (Run admin-setup.sql first if you haven't.)

create table if not exists player_names(
  key text primary key,                 -- lower(btrim(name)): the name in a form where "Sam" and "sam " are the same
  name text not null,
  owner text not null,                  -- 'u:<account id>' for Google sign-ins, 'd:<device id>' for guests
  email text,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);
alter table player_names enable row level security;
drop policy if exists pn_staff on player_names;
create policy pn_staff on player_names for all using (has_level('admin')) with check (has_level('admin'));

-- claim a name: true = it is yours now (or already was), false = someone else has it
create or replace function claim_name(n text, dev text, old text default '') returns boolean
language plpgsql security definer set search_path=public as $$
declare
  k text := lower(btrim(coalesce(n,'')));
  uid uuid := auth.uid();
  em text := lower(coalesce(auth.jwt()->>'email',''));
  dv text := coalesce(nullif(btrim(dev),''),'none');
  me text;
  r player_names%rowtype;
begin
  if k = '' or length(k) > 24 then return false; end if;
  me := case when uid is not null then 'u:'||uid::text else 'd:'||dv end;
  -- names reserved for staff chat badges belong to that staff member only
  if exists (select 1 from staff where lower(btrim(coalesce(chat_name,''))) = k and lower(email) <> em) then return false; end if;
  insert into player_names(key,name,owner,email) values (k, btrim(n), me, nullif(em,'')) on conflict (key) do nothing;
  select * into r from player_names where key = k;
  if r.owner = me then
    update player_names set last_seen = now(), name = btrim(n), email = coalesce(nullif(em,''), email) where key = k;
    return true;
  end if;
  -- a guest name from this same device, now signed in with Google: the account takes it over
  if uid is not null and r.owner = 'd:'||dv then
    update player_names set owner = me, email = nullif(em,''), last_seen = now() where key = k;
    return true;
  end if;
  return false;
end $$;

-- give a name back (when someone picks a different one)
create or replace function release_name(n text, dev text) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from player_names where key = lower(btrim(coalesce(n,'')))
    and owner = case when auth.uid() is not null then 'u:'||auth.uid()::text else 'd:'||coalesce(nullif(btrim(dev),''),'none') end;
end $$;

revoke all on function claim_name(text,text,text), release_name(text,text) from public;
grant execute on function claim_name(text,text,text), release_name(text,text) to anon, authenticated;

-- the admin Users tab: now also lists names that never posted a score or message, and shows Google vs guest
drop function if exists admin_players(text);
create function admin_players(q text default '') returns table(name text, avatar text, created timestamptz, last_seen timestamptz, scores numeric, msgs numeric, state text, until timestamptz, chat_banned boolean, login text, email text)
language sql stable security definer set search_path=public as $$
 with n as (select lower(s.name) k, max(s.name) nm, min(created_at) f, max(created_at) l, count(*) c, 0 m from scores s group by 1
            union all select lower(c.name), max(c.name), min(created_at), max(created_at), 0, count(*) from chat_messages c group by 1
            union all select k.key, k.name, k.created_at, k.last_seen, 0, 0 from player_names k),
 a as (select k, max(nm) nm, min(f) f, max(l) l, sum(c) c, sum(m) m from n group by k)
 select a.nm,
  (select case when av like 'data:%' then 'photo' else av end from (select avatar av from scores where lower(scores.name)=a.k order by created_at desc limit 1) z),
  (select min(u.created_at) from profiles pr join auth.users u on u.id=pr.user_id where lower(pr.data->'keys'->'player-name'->>'v')=a.k),
  a.l, a.c, a.m, coalesce(p.state,'ok'), p.until, coalesce(p.chat_banned,false),
  case when pn.owner like 'u:%' then 'Google' when pn.key is not null then 'Guest' else null end,
  pn.email
 from a left join player_status p on p.name=a.k left join player_names pn on pn.key=a.k
 where has_level('mod') and a.k like '%'||lower(replace(q,'%',''))||'%' order by a.l desc limit 200 $$;
revoke all on function admin_players(text) from public;
grant execute on function admin_players(text) to authenticated;

-- staff need table access on top of the policy (admin "Remove name")
grant select, insert, update, delete on public.player_names to authenticated;
