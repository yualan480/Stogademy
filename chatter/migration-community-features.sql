-- Chatter: profile pictures, polls, welcome messages, suggestions board.
-- Run once in Supabase Dashboard > SQL Editor, AFTER every other migration (it needs owner_only from migration-features.sql). Safe to re-run.
-- (Typing indicators, @mentions / #channels, spoilers and dark/light mode are browser-side and need nothing here.)

-- ───────── 1. Profile pictures ─────────
-- The app saves one small square JPEG per person at  avatars/<user id>/avatar.jpg  and stores its public URL on the profile.
-- Upserting a file needs SELECT on the person's own folder as well as INSERT/UPDATE (those two already exist).
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Only URLs that point at the avatars bucket are accepted (stops anyone using a profile picture as a tracking link).
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/avatar\.jpg(\?v=[0-9]+)?$') not valid;

-- ───────── 2. Messages: system messages (welcomes) and polls ─────────
alter table public.messages add column if not exists is_system boolean not null default false;
alter table public.messages add column if not exists has_poll  boolean not null default false;

-- People can never create system messages or polls by inserting directly; only the functions below can.
drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages for insert to authenticated with check (
  author_id = auth.uid() and not is_system and not has_poll and (
    (conversation_id is not null and public.is_conv_member(conversation_id))
    or (channel_id is not null and public.can_post(channel_id))));

-- Same guard as before, plus: system messages skip the checks.
create or replace function public.messages_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels; sm server_members; wait_s int;
begin
  if tg_op = 'INSERT' then
    if new.is_system then return new; end if;
    if (select count(*) from messages where author_id = new.author_id and created_at > now() - interval '10 seconds') >= 8 then
      raise exception 'You are sending messages too fast. Wait a few seconds.';
    end if;
    if new.channel_id is not null then
      select * into c from channels where id = new.channel_id;
      select * into sm from server_members where server_id = c.server_id and user_id = new.author_id;
      if sm.user_id is not null then
        if c.owner_only and sm.role <> 'owner' then
          raise exception 'Only the owner can post in #%.', c.name;
        end if;
        if sm.timeout_until is not null and sm.timeout_until > now() then
          raise exception 'You are timed out until %.', to_char(sm.timeout_until at time zone 'utc', 'Mon DD HH24:MI "UTC"');
        end if;
        if c.locked and not (sm.role = 'owner' or public.has_perm('lock_channels')) then
          raise exception 'This channel is locked.';
        end if;
        if c.slow_mode_seconds > 0 and not (sm.role = 'owner' or public.has_perm('slow_mode')) then
          select ceil(c.slow_mode_seconds - extract(epoch from (now() - max(created_at))))::int into wait_s
            from messages where channel_id = new.channel_id and author_id = new.author_id;
          if wait_s is not null and wait_s > 0 then raise exception 'Slow mode is on. Wait % more second(s).', wait_s; end if;
        end if;
      end if;
    end if;
  else
    if new.content is distinct from old.content then new.edited_at := now(); end if;
  end if;
  return new;
end $$;

-- ───────── 3. Polls ─────────
create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  multiple   boolean not null default false,
  ends_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls(id) on delete cascade,
  position int  not null default 0,
  label    text not null check (char_length(label) between 1 and 100)
);
create index if not exists poll_options_poll_idx on public.poll_options(poll_id);
create table if not exists public.poll_votes (
  poll_id   uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id)
);
create index if not exists poll_votes_user_idx on public.poll_votes(user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
revoke all on public.polls, public.poll_options, public.poll_votes from anon, authenticated;
grant select on public.polls, public.poll_options, public.poll_votes to authenticated;   -- writes only through the functions below

-- You can see a poll if you can see its message (and the message policy already checks channel / conversation access).
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id));
drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id));
drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id));

-- Posts the poll's message and its options in one step (so a poll can never exist half-made).
create or replace function public.create_poll(p_channel uuid, p_conversation uuid, p_question text, p_options text[],
                                              p_multiple boolean default false, p_hours int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q text := btrim(coalesce(p_question, '')); opts text[]; m messages; pid uuid; i int := 0; o text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if (p_channel is null) = (p_conversation is null) then raise exception 'Choose a channel or a conversation.'; end if;
  if char_length(q) < 1 or char_length(q) > 300 then raise exception 'The question must be 1 to 300 characters.'; end if;
  select coalesce(array_agg(btrim(x) order by n), '{}') into opts from unnest(coalesce(p_options, '{}')) with ordinality t(x, n) where btrim(x) <> '';
  if cardinality(opts) < 2 or cardinality(opts) > 10 then raise exception 'A poll needs 2 to 10 options.'; end if;
  foreach o in array opts loop
    if char_length(o) > 100 then raise exception 'Options can be at most 100 characters.'; end if;
  end loop;
  if p_hours is not null and (p_hours < 1 or p_hours > 720) then raise exception 'A poll can last from 1 hour to 30 days.'; end if;
  if p_channel is not null then
    if not public.can_post(p_channel) then raise exception 'You cannot post in this channel.'; end if;
  elsif not public.is_conv_member(p_conversation) then
    raise exception 'Conversation not found.';
  end if;
  insert into messages (channel_id, conversation_id, author_id, content, has_poll)
    values (p_channel, p_conversation, auth.uid(), q, true) returning * into m;
  insert into polls (message_id, multiple, ends_at, created_by)
    values (m.id, coalesce(p_multiple, false), case when p_hours is null then null else now() + make_interval(hours => p_hours) end, auth.uid())
    returning id into pid;
  foreach o in array opts loop
    insert into poll_options (poll_id, position, label) values (pid, i, o);
    i := i + 1;
  end loop;
  return to_jsonb(m);
end $$;

create or replace function public.vote_poll(p_poll uuid, p_option uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare pl polls; m messages;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into pl from polls where id = p_poll;
  if pl.id is null then raise exception 'Poll not found.'; end if;
  select * into m from messages where id = pl.message_id;
  if m.channel_id is not null then
    if not public.can_read_channel(m.channel_id) then raise exception 'Poll not found.'; end if;
  elsif not public.is_conv_member(m.conversation_id) then
    raise exception 'Poll not found.';
  end if;
  if pl.ends_at is not null and pl.ends_at <= now() then raise exception 'This poll has ended.'; end if;
  if not exists (select 1 from poll_options where id = p_option and poll_id = pl.id) then raise exception 'Option not found.'; end if;
  if p_on then
    if not pl.multiple then delete from poll_votes where poll_id = pl.id and user_id = auth.uid() and option_id <> p_option; end if;
    insert into poll_votes (poll_id, option_id, user_id) values (pl.id, p_option, auth.uid()) on conflict do nothing;
  else
    delete from poll_votes where poll_id = pl.id and option_id = p_option and user_id = auth.uid();
  end if;
end $$;

create or replace function public.end_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = public as $$
declare pl polls;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into pl from polls where id = p_poll;
  if pl.id is null or not exists (select 1 from messages where id = pl.message_id) then raise exception 'Poll not found.'; end if;
  if not (pl.created_by = auth.uid() or public.has_perm('delete_messages')) then raise exception 'Only the poll creator or a moderator can end it.'; end if;
  update polls set ends_at = now() where id = pl.id and (ends_at is null or ends_at > now());
end $$;

revoke execute on function public.create_poll(uuid, uuid, text, text[], boolean, int), public.vote_poll(uuid, uuid, boolean), public.end_poll(uuid) from public, anon;
grant  execute on function public.create_poll(uuid, uuid, text, text[], boolean, int), public.vote_poll(uuid, uuid, boolean), public.end_poll(uuid) to authenticated;

-- ───────── 4. Welcome messages ─────────
-- Every new member gets a greeting in #welcome (created here if it is missing). Only the owner can type in #welcome.
create or replace function public.ensure_welcome_channel(sid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare wc uuid; cat uuid; pos int;
begin
  select id into wc from channels where server_id = sid and kind = 'text' and lower(name) = 'welcome' limit 1;
  if wc is not null then return wc; end if;
  select id into cat from channel_categories where server_id = sid order by (name = 'Text Channels') desc, position limit 1;
  select coalesce(min(position), 0) - 1 into pos from channels where server_id = sid;
  insert into channels (server_id, category_id, name, description, kind, position, owner_only)
    values (sid, cat, 'welcome', 'New members are greeted here', 'text', pos, true) returning id into wc;
  return wc;
end $$;

create or replace function public.welcome_new_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare sv servers; wc uuid; uname text; n int; msg text; greetings text[];
begin
  if new.server_id is distinct from public.main_server() then return new; end if;
  select * into sv from servers where id = new.server_id;
  select username into uname from profiles where id = new.user_id;
  if sv.id is null or uname is null then return new; end if;
  wc := public.ensure_welcome_channel(sv.id);
  if exists (select 1 from messages where channel_id = wc and is_system and author_id = new.user_id) then return new; end if;   -- greet each person once
  select count(*) into n from server_members where server_id = sv.id;
  greetings := array[
    'Welcome to ' || sv.name || ', @' || uname || '! 🎉 We''re glad you''re here.',
    'Everyone say hi to @' || uname || '! 👋 Welcome to ' || sv.name || '.',
    '@' || uname || ' just joined ' || sv.name || '. Welcome aboard! 🚀',
    'A wild @' || uname || ' appeared! 🎮 Welcome to ' || sv.name || '.',
    'Welcome, @' || uname || '! Say hi in #general and make yourself at home. 💬'];
  msg := greetings[1 + floor(random() * array_length(greetings, 1))::int] || ' You are member #' || n || '.';
  if btrim(coalesce(sv.welcome_message, '')) <> '' then msg := msg || E'\n' || sv.welcome_message; end if;
  insert into messages (channel_id, author_id, content, is_system) values (wc, new.user_id, left(msg, 4000), true);
  return new;
exception when others then
  return new;   -- a greeting problem must never stop someone from joining
end $$;

drop trigger if exists server_members_welcome_trg on public.server_members;
create trigger server_members_welcome_trg after insert on public.server_members
  for each row execute function public.welcome_new_member();

revoke execute on function public.ensure_welcome_channel(uuid), public.welcome_new_member() from public, anon, authenticated;

-- Create #welcome now for the existing server (existing members are not greeted retroactively).
do $w$
begin
  if public.main_server() is not null then perform public.ensure_welcome_channel(public.main_server()); end if;
end $w$;

-- ───────── 5. Suggestions & Improvements ─────────
create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'suggestion' check (kind in ('suggestion', 'improvement', 'bug')),
  title      text not null check (char_length(title) between 3 and 100),
  body       text not null default '' check (char_length(body) <= 1000),
  status     text not null default 'open' check (status in ('open', 'planned', 'in_progress', 'done', 'declined')),
  staff_note text not null default '' check (char_length(staff_note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists suggestions_created_idx on public.suggestions(created_at desc);
create table if not exists public.suggestion_votes (
  suggestion_id uuid not null references public.suggestions(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (suggestion_id, user_id)
);
alter table public.suggestions enable row level security;
alter table public.suggestion_votes enable row level security;
revoke all on public.suggestions, public.suggestion_votes from anon, authenticated;
grant select on public.suggestions, public.suggestion_votes to authenticated;
drop policy if exists sug_read on public.suggestions;
create policy sug_read on public.suggestions for select to authenticated using (public.server_role(public.main_server()) is not null);
drop policy if exists sugv_read on public.suggestion_votes;
create policy sugv_read on public.suggestion_votes for select to authenticated using (public.server_role(public.main_server()) is not null);

create or replace function public.submit_suggestion(p_kind text, p_title text, p_body text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); sid uuid;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if p_kind is null or p_kind not in ('suggestion', 'improvement', 'bug') then raise exception 'Pick a type.'; end if;
  if char_length(t) < 3 or char_length(t) > 100 then raise exception 'The title must be 3 to 100 characters.'; end if;
  if char_length(b) > 1000 then raise exception 'Details can be at most 1000 characters.'; end if;
  if not public.is_owner() and (select count(*) from suggestions where author_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can send up to 5 suggestions a day. Try again tomorrow.';
  end if;
  insert into suggestions (author_id, kind, title, body) values (auth.uid(), p_kind, t, b) returning id into sid;
  insert into suggestion_votes (suggestion_id, user_id) values (sid, auth.uid());
  return sid;
end $$;

create or replace function public.vote_suggestion(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if not exists (select 1 from suggestions where id = p_id) then raise exception 'Suggestion not found.'; end if;
  if p_on then insert into suggestion_votes (suggestion_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  else delete from suggestion_votes where suggestion_id = p_id and user_id = auth.uid(); end if;
end $$;

-- Owner and admins only.
create or replace function public.set_suggestion_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s suggestions;
begin
  if not public.is_admin(public.main_server()) then raise exception 'Only the owner and admins can do that.'; end if;
  if p_status is null or p_status not in ('open', 'planned', 'in_progress', 'done', 'declined') then raise exception 'Pick a status.'; end if;
  if char_length(coalesce(p_note, '')) > 300 then raise exception 'The note can be at most 300 characters.'; end if;
  update suggestions set status = p_status, staff_note = btrim(coalesce(p_note, '')) where id = p_id returning * into s;
  if s.id is null then raise exception 'Suggestion not found.'; end if;
  perform public.log_action('suggestion.status', s.author_id, jsonb_build_object('title', left(s.title, 80), 'status', p_status));
end $$;

-- The author can remove their own; owner and admins can remove any.
create or replace function public.delete_suggestion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s suggestions;
begin
  select * into s from suggestions where id = p_id;
  if s.id is null then raise exception 'Suggestion not found.'; end if;
  if not (s.author_id = auth.uid() or public.is_admin(public.main_server())) then raise exception 'You can only delete your own suggestions.'; end if;
  delete from suggestions where id = p_id;
  if s.author_id <> auth.uid() then
    perform public.log_action('suggestion.delete', s.author_id, jsonb_build_object('title', left(s.title, 80)));
  end if;
end $$;

revoke execute on function public.submit_suggestion(text, text, text), public.vote_suggestion(uuid, boolean),
  public.set_suggestion_status(uuid, text, text), public.delete_suggestion(uuid) from public, anon;
grant  execute on function public.submit_suggestion(text, text, text), public.vote_suggestion(uuid, boolean),
  public.set_suggestion_status(uuid, text, text), public.delete_suggestion(uuid) to authenticated;

-- ───────── 6. Realtime: votes and new suggestions show up live ─────────
do $rt$
declare t text;
begin
  foreach t in array array['polls', 'poll_votes', 'suggestions', 'suggestion_votes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $rt$;
