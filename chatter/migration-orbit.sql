-- ═══════════════════════════════════════════════════════════════════════════
-- Orbit features: announcements, events + RSVPs, whiteboards (draw, notes, votes), AI request limit
-- Run this once in the Supabase SQL Editor. Safe to run again.
-- Who can do what:
--   everyone in the server: read everything, RSVP, draw, add notes, vote
--   owner / admins / moderators: post announcements, schedule events, create and manage boards
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────── helpers ─────────
create or replace function public.orbit_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.server_role(public.main_server()) is not null $$;

create or replace function public.orbit_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.server_role(public.main_server()) in ('owner', 'admin', 'moderator'), false) $$;

-- a member who is not timed out
create or replace function public.orbit_can_act() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.server_members
    where server_id = public.main_server() and user_id = auth.uid()
      and (timeout_until is null or timeout_until <= now())
  ) $$;

-- runs the server's word filter over text people write here (if the filter is installed)
create or replace function public.orbit_clean(t text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if t is null then return t; end if;
  if to_regprocedure('public.mask_profanity(text)') is not null then
    return public.mask_profanity(t);
  end if;
  return t;
end $$;

-- ───────── tables ─────────
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 2000),
  pinned     boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_created_idx on public.announcements(created_at desc);

create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 80),
  mode       text not null default 'collab' check (mode in ('collab', 'contest')),
  status     text not null default 'open' check (status in ('open', 'voting', 'ended')),
  prompt     text not null default '' check (char_length(prompt) <= 300),
  event_id   uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  kind        text not null default 'other' check (kind in ('game_night', 'trivia', 'tournament', 'drawing', 'other')),
  host_id     uuid references public.profiles(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text not null default '' check (char_length(location) <= 200),
  board_id    uuid references public.boards(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists events_starts_idx on public.events(starts_at);

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user_idx on public.event_rsvps(user_id);

-- one drawing stroke or one sticky note.
--   collab board: canvas_owner is null (everyone draws on the same canvas)
--   contest board: canvas_owner = the person whose entry it is
create table if not exists public.board_items (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  kind         text not null check (kind in ('stroke', 'note')),
  canvas_owner uuid,
  data         jsonb not null check (octet_length(data::text) < 40000),
  created_at   timestamptz not null default now()
);
create index if not exists board_items_board_idx on public.board_items(board_id, created_at);
create index if not exists board_items_author_idx on public.board_items(author_id, created_at desc);

-- a vote for a sticky note (target_kind 'note', target_id = the note) or a contest drawing (target_kind 'entry', target_id = the artist)
create table if not exists public.board_votes (
  board_id    uuid not null references public.boards(id) on delete cascade,
  target_kind text not null check (target_kind in ('note', 'entry')),
  target_id   uuid not null,
  voter_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (board_id, target_kind, target_id, voter_id)
);

-- AI request log (only used to apply a per-person hourly limit)
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage(user_id, created_at desc);

-- ───────── access: read for members; every write goes through the functions below ─────────
alter table public.announcements enable row level security;
alter table public.boards        enable row level security;
alter table public.events        enable row level security;
alter table public.event_rsvps   enable row level security;
alter table public.board_items   enable row level security;
alter table public.board_votes   enable row level security;
alter table public.ai_usage      enable row level security;

revoke all on public.announcements, public.boards, public.events, public.event_rsvps,
              public.board_items, public.board_votes, public.ai_usage from anon, authenticated;
grant select on public.announcements, public.boards, public.events, public.event_rsvps,
                public.board_items, public.board_votes to authenticated;

do $pol$
declare t text;
begin
  foreach t in array array['announcements', 'boards', 'events', 'event_rsvps', 'board_items', 'board_votes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.orbit_member())', t || '_read', t);
  end loop;
end $pol$;

-- ───────── announcements ─────────
create or replace function public.post_announcement(p_title text, p_body text default '', p_pinned boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); v_id uuid;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can post announcements.'; end if;
  if char_length(t) < 1 or char_length(t) > 120 then raise exception 'The title must be 1 to 120 characters.'; end if;
  if char_length(b) > 2000 then raise exception 'The text can be at most 2000 characters.'; end if;
  insert into announcements (title, body, pinned, created_by)
    values (public.orbit_clean(t), public.orbit_clean(b), coalesce(p_pinned, false), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.set_announcement_pinned(p_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can do that.'; end if;
  update announcements set pinned = coalesce(p_pinned, false) where id = p_id;
end $$;

create or replace function public.delete_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can do that.'; end if;
  delete from announcements where id = p_id;
end $$;

-- ───────── events ─────────
create or replace function public.save_event(p_id uuid, p_title text, p_description text, p_kind text, p_host uuid,
                                             p_starts timestamptz, p_ends timestamptz, p_location text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t text := btrim(coalesce(p_title, '')); d text := btrim(coalesce(p_description, '')); l text := btrim(coalesce(p_location, ''));
  h uuid := coalesce(p_host, auth.uid()); v_id uuid := p_id; b uuid; cur events;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can schedule events.'; end if;
  if char_length(t) < 1 or char_length(t) > 100 then raise exception 'The title must be 1 to 100 characters.'; end if;
  if char_length(d) > 2000 then raise exception 'The description can be at most 2000 characters.'; end if;
  if char_length(l) > 200 then raise exception 'The location can be at most 200 characters.'; end if;
  if p_kind is null or p_kind not in ('game_night', 'trivia', 'tournament', 'drawing', 'other') then raise exception 'Unknown event type.'; end if;
  if p_starts is null then raise exception 'Choose a start time.'; end if;
  if p_ends is not null and p_ends <= p_starts then raise exception 'The end must be after the start.'; end if;
  if not exists (select 1 from server_members where server_id = public.main_server() and user_id = h) then raise exception 'The host must be a member of the server.'; end if;
  t := public.orbit_clean(t); d := public.orbit_clean(d); l := public.orbit_clean(l);

  if v_id is null then
    insert into events (title, description, kind, host_id, starts_at, ends_at, location, created_by)
      values (t, d, p_kind, h, p_starts, p_ends, l, auth.uid()) returning id into v_id;
    insert into event_rsvps (event_id, user_id, status) values (v_id, h, 'going') on conflict do nothing;
  else
    update events set title = t, description = d, kind = p_kind, host_id = h, starts_at = p_starts, ends_at = p_ends, location = l
      where id = v_id returning * into cur;
    if cur.id is null then raise exception 'Event not found.'; end if;
  end if;

  -- a drawing contest gets its own contest board (made once)
  if p_kind = 'drawing' and not exists (select 1 from events where id = v_id and board_id is not null) then
    insert into boards (title, mode, prompt, created_by, event_id)
      values (left(t, 80), 'contest', left(d, 300), auth.uid(), v_id) returning id into b;
    update events set board_id = b where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_event(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can delete events.'; end if;
  delete from events where id = p_id;
end $$;

-- p_status: 'going', 'maybe', or anything else (for example 'none') to take yourself off the list
create or replace function public.rsvp_event(p_event uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot RSVP right now.'; end if;
  if not exists (select 1 from events where id = p_event) then raise exception 'Event not found.'; end if;
  if p_status in ('going', 'maybe') then
    insert into event_rsvps (event_id, user_id, status) values (p_event, auth.uid(), p_status)
      on conflict (event_id, user_id) do update set status = excluded.status;
  else
    delete from event_rsvps where event_id = p_event and user_id = auth.uid();
  end if;
end $$;

-- ───────── boards ─────────
create or replace function public.save_board(p_title text, p_mode text, p_prompt text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); v_id uuid;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can create boards.'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'The title must be 1 to 80 characters.'; end if;
  if p_mode not in ('collab', 'contest') then raise exception 'Unknown board type.'; end if;
  if char_length(coalesce(p_prompt, '')) > 300 then raise exception 'The prompt can be at most 300 characters.'; end if;
  insert into boards (title, mode, prompt, created_by)
    values (public.orbit_clean(t), p_mode, public.orbit_clean(btrim(coalesce(p_prompt, ''))), auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- collab boards: open or ended.  contest boards: open (drawing) -> voting -> ended
create or replace function public.set_board_status(p_board uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare b boards;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can do that.'; end if;
  select * into b from boards where id = p_board;
  if b.id is null then raise exception 'Board not found.'; end if;
  if p_status not in ('open', 'voting', 'ended') or (b.mode = 'collab' and p_status = 'voting') then raise exception 'That status is not available for this board.'; end if;
  update boards set status = p_status where id = p_board;
end $$;

create or replace function public.delete_board(p_board uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can delete boards.'; end if;
  delete from boards where id = p_board;
end $$;

-- staff: wipe a whole board, or one person's contest entry.  Members: wipe their own entry while drawing is open.
create or replace function public.clear_board(p_board uuid, p_owner uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare b boards;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into b from boards where id = p_board;
  if b.id is null then raise exception 'Board not found.'; end if;
  if not public.orbit_staff() then
    if not (b.mode = 'contest' and p_owner = auth.uid() and b.status = 'open') then raise exception 'Only the owner, admins and moderators can clear a board.'; end if;
  end if;
  if p_owner is not null then
    delete from board_items where board_id = p_board and canvas_owner = p_owner;
    delete from board_votes where board_id = p_board and target_kind = 'entry' and target_id = p_owner;
  else
    delete from board_items where board_id = p_board;
    delete from board_votes where board_id = p_board;
  end if;
end $$;

create or replace function public.board_add_item(p_board uuid, p_kind text, p_owner uuid, p_data jsonb) returns public.board_items
language plpgsql security definer set search_path = public as $$
declare b boards; it board_items; n int; txt text; col text; clean jsonb;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot draw here right now.'; end if;
  select * into b from boards where id = p_board;
  if b.id is null then raise exception 'Board not found.'; end if;
  if b.status = 'ended' then raise exception 'This board is closed.'; end if;
  if p_kind is null or p_kind not in ('stroke', 'note') then raise exception 'Unknown item.'; end if;
  if b.mode = 'contest' then
    if b.status <> 'open' then raise exception 'Drawing is closed. Voting has started.'; end if;
    if p_kind <> 'stroke' then raise exception 'Contest entries are drawings only.'; end if;
    if p_owner is distinct from auth.uid() then raise exception 'You can only draw on your own canvas.'; end if;
  elsif p_owner is not null then
    raise exception 'This board has one shared canvas.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 40000 then raise exception 'That is too big.'; end if;

  select count(*) into n from board_items where author_id = auth.uid() and created_at > now() - interval '10 seconds';
  if n >= 80 then raise exception 'Slow down a little.'; end if;
  select count(*) into n from board_items where board_id = p_board and author_id = auth.uid();
  if n >= 3000 then raise exception 'You have reached the limit for this board.'; end if;

  if p_kind = 'stroke' then
    -- p = flat list [x1,y1,x2,y2,...] in a 1200 x 800 space
    if jsonb_typeof(p_data->'p') <> 'array' or jsonb_array_length(p_data->'p') < 4 or jsonb_array_length(p_data->'p') > 8000 or jsonb_array_length(p_data->'p') % 2 <> 0 then
      raise exception 'That drawing is not valid.';
    end if;
    if exists (select 1 from jsonb_array_elements(p_data->'p') e where jsonb_typeof(e) <> 'number') then raise exception 'That drawing is not valid.'; end if;
    col := p_data->>'c';
    if col is null or col !~ '^#[0-9a-fA-F]{6}$' then raise exception 'That colour is not valid.'; end if;
    if coalesce((p_data->>'w')::numeric, 0) < 1 or (p_data->>'w')::numeric > 40 then raise exception 'That brush size is not valid.'; end if;
    clean := jsonb_build_object('p', p_data->'p', 'c', col, 'w', round((p_data->>'w')::numeric));
  else
    txt := btrim(coalesce(p_data->>'t', ''));
    if char_length(txt) < 1 or char_length(txt) > 200 then raise exception 'A note must be 1 to 200 characters.'; end if;
    col := coalesce(p_data->>'c', 'yellow');
    if col not in ('yellow', 'pink', 'green', 'blue') then col := 'yellow'; end if;
    clean := jsonb_build_object('t', public.orbit_clean(txt),
                                'x', least(1, greatest(0, coalesce((p_data->>'x')::numeric, 0.5))),
                                'y', least(1, greatest(0, coalesce((p_data->>'y')::numeric, 0.5))),
                                'c', col);
  end if;

  insert into board_items (board_id, author_id, kind, canvas_owner, data)
    values (p_board, auth.uid(), p_kind, case when b.mode = 'contest' then auth.uid() else null end, clean)
    returning * into it;
  return it;
end $$;

create or replace function public.board_delete_item(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it board_items; b boards;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select * into it from board_items where id = p_item;
  if it.id is null then return; end if;
  select * into b from boards where id = it.board_id;
  if not public.orbit_staff() then
    if it.author_id is distinct from auth.uid() then raise exception 'You can only remove your own drawings and notes.'; end if;
    if b.status = 'ended' or (b.mode = 'contest' and b.status <> 'open') then raise exception 'This board is closed.'; end if;
  end if;
  delete from board_items where id = p_item;
  if it.kind = 'note' then delete from board_votes where board_id = it.board_id and target_kind = 'note' and target_id = it.id; end if;
end $$;

create or replace function public.board_vote(p_board uuid, p_kind text, p_target uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare b boards;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot vote right now.'; end if;
  select * into b from boards where id = p_board;
  if b.id is null then raise exception 'Board not found.'; end if;
  if b.status = 'ended' then raise exception 'This board is closed.'; end if;
  if p_kind = 'note' then
    if not exists (select 1 from board_items where id = p_target and board_id = p_board and kind = 'note') then raise exception 'Note not found.'; end if;
  elsif p_kind = 'entry' then
    if b.mode <> 'contest' or b.status <> 'voting' then raise exception 'Voting is not open.'; end if;
    if p_target = auth.uid() then raise exception 'You cannot vote for your own drawing.'; end if;
    if not exists (select 1 from board_items where board_id = p_board and canvas_owner = p_target) then raise exception 'Drawing not found.'; end if;
  else
    raise exception 'Unknown vote.';
  end if;
  if coalesce(p_on, true) then
    insert into board_votes (board_id, target_kind, target_id, voter_id) values (p_board, p_kind, p_target, auth.uid()) on conflict do nothing;
  else
    delete from board_votes where board_id = p_board and target_kind = p_kind and target_id = p_target and voter_id = auth.uid();
  end if;
end $$;

-- ───────── AI: a simple per-person limit, used by the orbit-ai edge function ─────────
create or replace function public.ai_check_quota(p_kind text default 'chat') returns void
language plpgsql security definer set search_path = public as $$
declare n int; lim int := 40;   -- requests per person per hour
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not public.orbit_member() then raise exception 'Join the server to use the AI features.'; end if;
  select count(*) into n from ai_usage where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if n >= lim then raise exception 'You have used your AI requests for this hour. Try again a bit later.'; end if;
  insert into ai_usage (user_id, kind) values (auth.uid(), left(coalesce(p_kind, 'chat'), 20));
  if random() < 0.02 then delete from ai_usage where created_at < now() - interval '2 days'; end if;
end $$;

-- ───────── permissions on the functions ─────────
revoke execute on function
  public.orbit_member(), public.orbit_staff(), public.orbit_can_act(), public.orbit_clean(text),
  public.post_announcement(text, text, boolean), public.set_announcement_pinned(uuid, boolean), public.delete_announcement(uuid),
  public.save_event(uuid, text, text, text, uuid, timestamptz, timestamptz, text), public.delete_event(uuid), public.rsvp_event(uuid, text),
  public.save_board(text, text, text), public.set_board_status(uuid, text), public.delete_board(uuid), public.clear_board(uuid, uuid),
  public.board_add_item(uuid, text, uuid, jsonb), public.board_delete_item(uuid), public.board_vote(uuid, text, uuid, boolean),
  public.ai_check_quota(text)
  from public, anon;
grant execute on function
  public.orbit_member(), public.orbit_staff(), public.orbit_can_act(),
  public.post_announcement(text, text, boolean), public.set_announcement_pinned(uuid, boolean), public.delete_announcement(uuid),
  public.save_event(uuid, text, text, text, uuid, timestamptz, timestamptz, text), public.delete_event(uuid), public.rsvp_event(uuid, text),
  public.save_board(text, text, text), public.set_board_status(uuid, text), public.delete_board(uuid), public.clear_board(uuid, uuid),
  public.board_add_item(uuid, text, uuid, jsonb), public.board_delete_item(uuid), public.board_vote(uuid, text, uuid, boolean),
  public.ai_check_quota(text)
  to authenticated;

-- ───────── a shared board to start with ─────────
insert into public.boards (title, mode, prompt)
select 'Community board', 'collab', 'Draw, doodle and leave sticky notes. Vote up the ideas you like.'
where not exists (select 1 from public.boards);

-- ───────── realtime: everything updates live ─────────
alter table public.event_rsvps replica identity full;
alter table public.board_items replica identity full;
alter table public.board_votes replica identity full;

do $rt$
declare t text;
begin
  foreach t in array array['announcements', 'events', 'event_rsvps', 'boards', 'board_items', 'board_votes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $rt$;
