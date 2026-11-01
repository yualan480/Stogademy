-- CHAT V2 SETUP (already applied to your Supabase project "Unblocker4school" on 2026-10-13).
-- Kept here so you can re-run it on a fresh project. Safe to re-run.
-- Adds: channels, replies, reactions, polls, score cards, edit/delete own messages, staff badges, optional DMs.

alter table public.chat_messages
  add column if not exists channel text not null default 'general',
  add column if not exists kind text not null default 'text',
  add column if not exists reply_to bigint references public.chat_messages(id) on delete set null,
  add column if not exists meta jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists owner_hash text;
do $$ begin alter table public.chat_messages add constraint chat_msg_channel_ck check (channel ~ '^[a-z0-9-]{1,24}$' or channel ~ '^dm:.{1,12}\|.{1,12}$'); exception when duplicate_object then null; end $$;
do $$ begin alter table public.chat_messages add constraint chat_msg_kind_ck check (kind in ('text','score','poll')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.chat_messages add constraint chat_msg_meta_ck check (meta is null or pg_column_size(meta) < 1500); exception when duplicate_object then null; end $$;
do $$ begin alter table public.chat_messages add constraint chat_msg_hash_ck check (owner_hash is null or owner_hash ~ '^[0-9a-f]{64}$'); exception when duplicate_object then null; end $$;
create index if not exists chat_messages_channel_id_idx on public.chat_messages(channel, id desc);

create table if not exists public.chat_channels(
  id text primary key check (id ~ '^[a-z0-9-]{1,24}$' and id not like 'g-%'),
  title text not null, blurb text,
  score_only boolean not null default false, staff_only boolean not null default false,
  sort_order int not null default 0);
insert into public.chat_channels(id,title,blurb,score_only,staff_only,sort_order) values
 ('general','general','Everything and anything',false,false,1),
 ('game-chat','game-chat','Talk about the games',false,false,2),
 ('memes','memes','Funny stuff. Keep it kind.',false,false,3),
 ('high-scores','high-scores','Share your personal bests with the + button',true,false,4)
on conflict do nothing;

alter table public.staff add column if not exists chat_name text;
create or replace function public.chat_staff() returns table(name text, role text)
language sql stable security definer set search_path=public as $$
  select lower(btrim(chat_name)), role from staff where chat_name is not null $$;

create table if not exists public.chat_reactions(
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 12),
  emoji text not null check (emoji ~ '^[^[:alnum:][:space:]]{1,8}$'),
  created_at timestamptz default now());
create unique index if not exists chat_reactions_uq on public.chat_reactions(message_id, lower(btrim(name)), emoji);
create index if not exists chat_reactions_msg on public.chat_reactions(message_id);
create table if not exists public.chat_poll_votes(
  id bigint generated always as identity primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 12),
  opt int not null check (opt between 0 and 3),
  created_at timestamptz default now());
create unique index if not exists chat_poll_votes_uq on public.chat_poll_votes(message_id, lower(btrim(name)));

alter table public.chat_channels enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_poll_votes enable row level security;
drop policy if exists cc_r on public.chat_channels;  create policy cc_r on public.chat_channels for select using (true);
drop policy if exists cc_w on public.chat_channels;  create policy cc_w on public.chat_channels for all using (has_level('admin')) with check (has_level('admin'));
drop policy if exists cr_r on public.chat_reactions; create policy cr_r on public.chat_reactions for select using (true);
drop policy if exists cr_d on public.chat_reactions; create policy cr_d on public.chat_reactions for delete using (has_level('mod'));
drop policy if exists cv_r on public.chat_poll_votes; create policy cv_r on public.chat_poll_votes for select using (true);
drop policy if exists cv_d on public.chat_poll_votes; create policy cv_d on public.chat_poll_votes for delete using (has_level('mod'));
revoke insert, update, delete, truncate on public.chat_reactions, public.chat_poll_votes from anon;
revoke insert, update, delete, truncate on public.chat_channels from anon;
grant select on public.chat_channels, public.chat_reactions, public.chat_poll_votes to anon, authenticated;

create or replace function public.chat_rules() returns trigger language plpgsql security definer set search_path=public as $$
declare ch record; st record; a text; b text; me text := lower(btrim(new.name)); gm text; sc int;
begin
  select * into st from staff where chat_name is not null and lower(btrim(chat_name))=me limit 1;
  if found and lower(coalesce(auth.jwt()->>'email',''))<>lower(st.email) then
    raise exception 'That name belongs to a staff member. Please pick a different name.'; end if;
  if new.channel like 'dm:%' then
    if coalesce(setting('chat_dms_enabled')::text,'false')<>'true' then raise exception 'Direct messages are turned off.'; end if;
    a := split_part(substr(new.channel,4),'|',1); b := split_part(substr(new.channel,4),'|',2);
    if a='' or b='' or a=b or me not in (a,b) then raise exception 'That is not your conversation.'; end if;
  elsif new.channel like 'g-%' then
    if not exists(select 1 from games_config where id=substr(new.channel,3)) then raise exception 'Unknown channel.'; end if;
  else
    select * into ch from chat_channels where id=new.channel;
    if not found then raise exception 'Unknown channel.'; end if;
    if ch.staff_only and not has_level('mod') then raise exception 'Only staff can post in this channel.'; end if;
    if ch.score_only and new.kind<>'score' and not has_level('mod') then raise exception 'This channel is for sharing high scores. Use the + button.'; end if;
  end if;
  if new.kind='score' then
    begin gm := new.meta->>'game'; sc := (new.meta->>'score')::int;
    exception when others then raise exception 'Invalid score card.'; end;
    if not exists(select 1 from scores where lower(btrim(name))=me and game=gm and score=sc) then
      raise exception 'That score is not on the leaderboard under your name.'; end if;
  elsif new.kind='poll' then
    if jsonb_typeof(new.meta->'opts')<>'array' or jsonb_array_length(new.meta->'opts') not between 2 and 4 then raise exception 'A poll needs 2 to 4 options.'; end if;
    if exists(select 1 from jsonb_array_elements_text(new.meta->'opts') o where length(btrim(o))=0 or length(o)>40) then raise exception 'Poll options must be 1 to 40 characters.'; end if;
  else
    new.meta := null;
  end if;
  if new.reply_to is not null and not exists(select 1 from chat_messages where id=new.reply_to and channel=new.channel) then new.reply_to := null; end if;
  return new;
end $$;
drop trigger if exists chat_rules_trg on public.chat_messages;
create trigger chat_rules_trg before insert on public.chat_messages for each row execute function public.chat_rules();

create or replace function public.chat_guard_user(who text) returns void language plpgsql security definer set search_path=public as $$
declare s player_status;
begin
  select * into s from player_status where name=lower(btrim(who));
  if s.state in ('banned','suspended') and (s.until is null or s.until>now()) then raise exception 'Your account is restricted.'; end if;
  if coalesce(setting('chat_enabled')::text,'true')<>'true' then raise exception 'Chat is turned off right now.'; end if;
  if s.chat_banned or (s.state='muted' and (s.until is null or s.until>now())) then raise exception 'You are muted.'; end if;
end $$;
create or replace function public.chat_react(mid bigint, who text, emo text) returns void language plpgsql security definer set search_path=public as $$
begin
  if char_length(btrim(who)) not between 1 and 12 then raise exception 'Bad name.'; end if;
  perform chat_guard_user(who);
  if not exists(select 1 from chat_messages where id=mid) then raise exception 'Message not found.'; end if;
  delete from chat_reactions where message_id=mid and lower(btrim(name))=lower(btrim(who)) and emoji=emo;
  if not found then
    if (select count(*) from chat_reactions where message_id=mid and lower(btrim(name))=lower(btrim(who)))>=6 then raise exception 'Too many reactions on one message.'; end if;
    insert into chat_reactions(message_id,name,emoji) values (mid,btrim(who),emo);
  end if;
end $$;
create or replace function public.chat_vote(mid bigint, who text, o int) returns void language plpgsql security definer set search_path=public as $$
declare m chat_messages;
begin
  if char_length(btrim(who)) not between 1 and 12 then raise exception 'Bad name.'; end if;
  perform chat_guard_user(who);
  select * into m from chat_messages where id=mid and kind='poll';
  if not found then raise exception 'Poll not found.'; end if;
  if o<0 or o>=jsonb_array_length(m.meta->'opts') then raise exception 'Bad option.'; end if;
  insert into chat_poll_votes(message_id,name,opt) values (mid,btrim(who),o)
  on conflict (message_id, (lower(btrim(name)))) do update set opt=excluded.opt;
end $$;
create or replace function public.chat_edit(mid bigint, tok text, txt text) returns void language plpgsql security definer set search_path=public as $$
declare h text := encode(sha256(convert_to(coalesce(tok,''),'utf8')),'hex'); nm text; lim int;
begin
  select name into nm from chat_messages where id=mid and owner_hash=h and kind='text';
  if nm is null then raise exception 'You can only edit your own messages.'; end if;
  perform chat_guard_user(nm);
  lim := coalesce((setting('chat_max_len')#>>'{}')::int,200);
  if char_length(btrim(txt)) not between 1 and lim then raise exception 'Message is too long or empty.'; end if;
  update chat_messages set message=btrim(txt), edited_at=now() where id=mid;
end $$;
create or replace function public.chat_delete(mid bigint, tok text) returns void language plpgsql security definer set search_path=public as $$
declare h text := encode(sha256(convert_to(coalesce(tok,''),'utf8')),'hex');
begin
  delete from chat_messages where id=mid and owner_hash=h;
  if not found then raise exception 'You can only delete your own messages.'; end if;
end $$;
revoke all on function public.chat_guard_user(text), public.chat_react(bigint,text,text), public.chat_vote(bigint,text,int), public.chat_edit(bigint,text,text), public.chat_delete(bigint,text), public.chat_staff() from public;
grant execute on function public.chat_react(bigint,text,text), public.chat_vote(bigint,text,int), public.chat_edit(bigint,text,text), public.chat_delete(bigint,text), public.chat_staff() to anon, authenticated;
insert into public.site_settings(key,value) values ('chat_dms_enabled','false') on conflict do nothing;
do $$ begin alter publication supabase_realtime add table public.chat_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_poll_votes; exception when duplicate_object then null; end $$;
