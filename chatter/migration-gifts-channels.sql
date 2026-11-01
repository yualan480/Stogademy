-- Orbit: (1) gifting Orbits in DMs and public channels, (2) #suggestions and #tutorials channels under #help.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-orbits-unified.sql, migration-orbit-drift.sql and migration-orbit-leaderboard-current.sql.
--
--  Gifts:     2-person DM -> the Orbits go straight to the other person.
--             Group DM or public channel -> a gift card is posted; the FIRST person to click Claim gets the Orbits.
--             The sender can take an unclaimed gift back (also happens if the message is deleted).
--             Gifts move Orbits between balances. They never count as "earned", so they cannot inflate the Day/Week/Month/All-time boards.
--  Channels:  #suggestions opens the Suggestions board, #tutorials is a video gallery (only videos can be posted).

-- ───────── 1. ledger: two new reasons (gift_out is negative, gift_in positive) ─────────
alter table public.orbit_ledger drop constraint if exists orbit_ledger_reason_check;
alter table public.orbit_ledger add constraint orbit_ledger_reason_check check (reason = any (array[
  'event','host_event','challenge','weekly_milestone','tournament','time_on_orbit','tournament_2nd','tournament_3rd','login_streak','help',
  'bug_report','poll','staff_event','monthly_milestone','member_of_month','game','spend','orbit_drift','gift_out','gift_in'])) not valid;

-- gifts never count as "earned" on the leaderboard (Current = balance, so gifts do move that one)
drop function if exists public.orbit_leaderboard(int);
create or replace function public.orbit_leaderboard(p_days int default 1)
returns table (rank bigint, user_id uuid, display_name text, total bigint, prev_rank bigint)
language sql stable security definer set search_path = public as $$
  with m as (select coalesce(p_days, 1) as d),
  cur as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then true
                when m.d = 0 then l.amount > 0 and l.reason <> 'gift_in'
                else l.amount > 0 and l.reason <> 'gift_in' and l.created_at >= now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv as (
    select l.user_id, sum(l.amount)::bigint as t
      from orbit_ledger l, m
     where case when m.d < 0 then l.created_at < now() - interval '7 days'
                when m.d = 0 then l.amount > 0 and l.reason <> 'gift_in' and l.created_at < now() - interval '7 days'
                else l.amount > 0 and l.reason <> 'gift_in' and l.created_at >= now() - make_interval(days => 2 * m.d) and l.created_at < now() - make_interval(days => m.d) end
     group by l.user_id
    having sum(l.amount) > 0),
  prv_r as (select user_id, rank() over (order by t desc) as r from prv)
  select rank() over (order by cur.t desc), cur.user_id, p.display_name, cur.t, prv_r.r
    from cur join profiles p on p.id = cur.user_id left join prv_r on prv_r.user_id = cur.user_id
   order by cur.t desc limit 50 $$;
revoke all on function public.orbit_leaderboard(int) from public;
grant execute on function public.orbit_leaderboard(int) to authenticated;

-- ───────── 2. gifts ─────────
alter table public.messages add column if not exists gift_id uuid;

create table if not exists public.orbit_gifts (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  amount          int  not null check (amount between 1 and 100000),
  channel_id      uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  direct          boolean not null default false,
  status          text not null default 'open' check (status in ('open','claimed','cancelled')),
  claimed_by      uuid references public.profiles(id) on delete set null,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now(),
  check ((channel_id is null) <> (conversation_id is null))
);
create index if not exists orbit_gifts_open on public.orbit_gifts (status, created_at desc);
alter table public.orbit_gifts enable row level security;
drop policy if exists og_read on public.orbit_gifts;
create policy og_read on public.orbit_gifts for select to authenticated using (
  sender_id = auth.uid() or claimed_by = auth.uid()
  or (channel_id is not null and public.can_read_channel(channel_id))
  or (conversation_id is not null and public.is_conv_member(conversation_id)));
revoke insert, update, delete on public.orbit_gifts from anon, authenticated;

create or replace function public.send_orbit_gift(p_amount int, p_channel uuid default null, p_conversation uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); bal bigint; gid uuid := gen_random_uuid(); other uuid; n int; mid uuid; dr boolean := false; ch channels;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then raise exception 'Gift between 1 and 100,000 Orbits.'; end if;
  if (p_channel is null) = (p_conversation is null) then raise exception 'Pick one place to send the gift.'; end if;
  if p_channel is not null then
    select * into ch from channels where id = p_channel;
    if not found or ch.kind <> 'text' or not public.can_read_channel(p_channel) then raise exception 'You cannot send a gift there.'; end if;
    if coalesce(ch.special, '') <> '' or coalesce(ch.is_rules, false) then raise exception 'Gifts cannot be sent in this channel.'; end if;
    if exists (select 1 from server_members where server_id = ch.server_id and user_id = uid and muted) then raise exception 'You are muted here.'; end if;
  else
    if not public.is_conv_member(p_conversation) then raise exception 'You cannot send a gift there.'; end if;
    select count(*) into n from conversation_members where conversation_id = p_conversation;
    if n = 2 then
      select user_id into other from conversation_members where conversation_id = p_conversation and user_id <> uid limit 1;
      dr := other is not null;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('orbit-spend-' || uid::text));   -- same lock the shop uses: two spends can never overspend
  select coalesce(sum(amount), 0) into bal from orbit_ledger where user_id = uid;
  if bal < p_amount then raise exception 'Not enough Orbits.'; end if;
  insert into orbit_gifts (id, sender_id, amount, channel_id, conversation_id, direct, status, claimed_by, claimed_at)
    values (gid, uid, p_amount, p_channel, p_conversation, dr, case when dr then 'claimed' else 'open' end, case when dr then other end, case when dr then now() end);
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, -p_amount, 'gift_out', 'gift:' || gid);
  if dr then insert into orbit_ledger (user_id, amount, reason, ref) values (other, p_amount, 'gift_in', 'gift:' || gid); end if;
  insert into messages (channel_id, conversation_id, author_id, content, gift_id) values (p_channel, p_conversation, uid, '🎁 Orbit gift', gid) returning id into mid;
  return jsonb_build_object('gift_id', gid, 'message_id', mid, 'balance', bal - p_amount, 'direct', dr);
end $f$;
revoke all on function public.send_orbit_gift(int, uuid, uuid) from public, anon;
grant execute on function public.send_orbit_gift(int, uuid, uuid) to authenticated;

-- the first click wins: the row is locked, so two people can never both get it
create or replace function public.claim_orbit_gift(p_gift uuid)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); g orbit_gifts;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into g from orbit_gifts where id = p_gift for update;
  if not found then raise exception 'That gift is gone.'; end if;
  if g.status = 'claimed' then raise exception 'Someone already claimed this gift.'; end if;
  if g.status = 'cancelled' then raise exception 'The sender took this gift back.'; end if;
  if g.sender_id = uid then raise exception 'You cannot claim your own gift.'; end if;
  if not ((g.channel_id is not null and public.can_read_channel(g.channel_id)) or (g.conversation_id is not null and public.is_conv_member(g.conversation_id))) then
    raise exception 'You cannot claim this gift.'; end if;
  update orbit_gifts set status = 'claimed', claimed_by = uid, claimed_at = now() where id = g.id;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, g.amount, 'gift_in', 'gift:' || g.id);
  return jsonb_build_object('amount', g.amount, 'balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $f$;
revoke all on function public.claim_orbit_gift(uuid) from public, anon;
grant execute on function public.claim_orbit_gift(uuid) to authenticated;

create or replace function public.cancel_orbit_gift(p_gift uuid)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); g orbit_gifts;
begin
  if uid is null then raise exception 'Log in to Orbit first.'; end if;
  select * into g from orbit_gifts where id = p_gift for update;
  if not found or g.sender_id <> uid then raise exception 'That is not your gift.'; end if;
  if g.status <> 'open' then raise exception 'This gift was already claimed or taken back.'; end if;
  update orbit_gifts set status = 'cancelled' where id = g.id;
  insert into orbit_ledger (user_id, amount, reason, ref) values (uid, g.amount, 'gift_in', 'refund:' || g.id);
  return jsonb_build_object('balance', (select coalesce(sum(amount), 0) from orbit_ledger where user_id = uid));
end $f$;
revoke all on function public.cancel_orbit_gift(uuid) from public, anon;
grant execute on function public.cancel_orbit_gift(uuid) to authenticated;

-- deleting the gift message (by the sender or a moderator) gives an unclaimed gift back
create or replace function public.gift_message_deleted() returns trigger
language plpgsql security definer set search_path = public as $f$
declare g orbit_gifts;
begin
  if old.gift_id is null then return old; end if;
  select * into g from orbit_gifts where id = old.gift_id for update;
  if found and g.status = 'open' then
    update orbit_gifts set status = 'cancelled' where id = g.id;
    insert into orbit_ledger (user_id, amount, reason, ref) values (g.sender_id, g.amount, 'gift_in', 'refund:' || g.id) on conflict do nothing;
  end if;
  return old;
end $f$;
drop trigger if exists gift_message_deleted on public.messages;
create trigger gift_message_deleted before delete on public.messages for each row execute function public.gift_message_deleted();

do $$ begin
  begin alter publication supabase_realtime add table public.orbit_gifts; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

-- ───────── 3. special channels ─────────
alter table public.channels add column if not exists special text check (special in ('suggestions', 'videos'));

-- #suggestions and #tutorials may not take normal chat; #tutorials takes only videos (a title is optional)
create or replace function public.messages_special_channels() returns trigger
language plpgsql security definer set search_path = public as $f$
declare sp text;
begin
  if new.channel_id is null then return new; end if;
  select special into sp from channels where id = new.channel_id;
  if sp = 'suggestions' then raise exception 'Use the Suggestions board here. Chat messages are not allowed in #suggestions.'; end if;
  if sp = 'videos' then
    if jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) = 0
       or exists (select 1 from jsonb_array_elements(new.attachments) a where coalesce(a->>'type', '') not like 'video/%') then
      raise exception 'This channel only takes videos. Attach a tutorial video (you can add a title).';
    end if;
    if new.gift_id is not null or new.has_poll then raise exception 'This channel only takes videos.'; end if;
  end if;
  return new;
end $f$;
drop trigger if exists messages_special_channels on public.messages;
create trigger messages_special_channels before insert on public.messages for each row execute function public.messages_special_channels();

-- put #suggestions right under #help and #tutorials right under #suggestions
do $$
declare h channels; sid uuid;
begin
  select * into h from channels where name = 'help' and kind = 'text' order by created_at limit 1;
  if not found then raise notice 'No #help channel found: create #suggestions and #tutorials by hand (Create channel), then run: update channels set special = ''suggestions'' where name = ''suggestions''; update channels set special = ''videos'' where name = ''tutorials'';'; return; end if;
  sid := h.server_id;
  if not exists (select 1 from channels where server_id = sid and special = 'suggestions') then
    update channels set position = position + 2 where server_id = sid and category_id is not distinct from h.category_id and position > h.position;
    insert into channels (server_id, category_id, name, description, kind, position, special)
      values (sid, h.category_id, 'suggestions', 'Suggestions, improvements and bug reports. Vote on ideas here.', 'text', h.position + 1, 'suggestions');
    insert into channels (server_id, category_id, name, description, kind, position, special)
      values (sid, h.category_id, 'tutorials', 'Video tutorials for the games. Only videos can be posted here.', 'text', h.position + 2, 'videos');
  end if;
end $$;
