-- ═══════════════════════════════════════════════════════════════════════════
-- Orbit Communities: discover, join and explore interest communities.
-- Run once in Supabase Dashboard > SQL Editor, AFTER migration-orbit.sql. Safe to run again.
-- Who can do what:
--   everyone in the server: browse communities, join / leave, post, reply, RSVP, accept invites
--   community owner / moderators and Orbit staff: remove posts and events, host events
--   editing, member roles and deleting a community: see migration-community-admin.sql
--   Joining, leaving and creating go through functions below, so member counts always stay right.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────── tables ─────────
create table if not exists public.communities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 40),
  description  text not null default '' check (char_length(description) <= 240),
  category     text not null default 'other' check (category in ('gaming', 'anime', 'art', 'music', 'tech', 'other')),
  icon         text not null default '🌐' check (char_length(icon) between 1 and 8),
  color        text not null default '#4c6fff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  tags         text[] not null default '{}' check (cardinality(tags) <= 4),
  verified     boolean not null default false,
  member_count integer not null default 0,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists communities_name_idx on public.communities (lower(name));

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'moderator', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id);
create index if not exists community_members_joined_idx on public.community_members (joined_at desc);

-- kind: discussion (with replies), update (announcement from owner / mods), media (an image)
create table if not exists public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  kind         text not null check (kind in ('discussion', 'update', 'media')),
  title        text not null default '' check (char_length(title) <= 120),
  body         text not null default '' check (char_length(body) <= 2000),
  image_url    text check (image_url is null or image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/community-media/'),
  created_at   timestamptz not null default now(),
  check (kind <> 'discussion' or char_length(title) >= 1),
  check (kind <> 'media' or image_url is not null)
);
create index if not exists community_posts_idx on public.community_posts (community_id, kind, created_at desc);

create table if not exists public.community_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_replies_idx on public.community_replies (post_id, created_at);

create table if not exists public.community_events (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 100),
  description  text not null default '' check (char_length(description) <= 600),
  starts_at    timestamptz not null,
  location     text not null default '' check (char_length(location) <= 120),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists community_events_idx on public.community_events (community_id, starts_at);

create table if not exists public.community_event_rsvps (
  event_id   uuid not null references public.community_events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.community_invites (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  invited_user uuid not null references public.profiles(id) on delete cascade,
  invited_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (community_id, invited_user)
);
create index if not exists community_invites_user_idx on public.community_invites (invited_user);

-- ───────── helpers ─────────
create or replace function public.community_role(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.community_members where community_id = p_id and user_id = auth.uid() $$;

create or replace function public.community_manager(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.community_role(p_id) in ('owner', 'moderator'), false) or public.orbit_staff() $$;

-- keeps communities.member_count right whatever way a membership row appears or goes away
create or replace function public.community_count_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update communities set member_count = member_count + 1 where id = new.community_id;
  else update communities set member_count = greatest(member_count - 1, 0) where id = old.community_id; end if;
  return null;
end $$;
drop trigger if exists community_members_count on public.community_members;
create trigger community_members_count after insert or delete on public.community_members
  for each row execute function public.community_count_trg();

-- word filter, slow-down and "updates are for managers" on everything people write
create or replace function public.community_text_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'community_posts' then
    if new.kind = 'update' and not public.community_manager(new.community_id) then
      raise exception 'Only the owner and moderators can post updates.';
    end if;
    if (select count(*) from community_posts where author_id = new.author_id and created_at > now() - interval '1 minute') >= 5 then
      raise exception 'You are posting too fast. Wait a moment.';
    end if;
    new.title := public.orbit_clean(new.title); new.body := public.orbit_clean(new.body);
  elsif tg_table_name = 'community_replies' then
    if (select count(*) from community_replies where author_id = new.author_id and created_at > now() - interval '1 minute') >= 10 then
      raise exception 'You are replying too fast. Wait a moment.';
    end if;
    new.body := public.orbit_clean(new.body);
  end if;
  return new;
end $$;
drop trigger if exists community_posts_guard on public.community_posts;
create trigger community_posts_guard before insert on public.community_posts for each row execute function public.community_text_guard();
drop trigger if exists community_replies_guard on public.community_replies;
create trigger community_replies_guard before insert on public.community_replies for each row execute function public.community_text_guard();

-- ───────── row level security ─────────
alter table public.communities           enable row level security;
alter table public.community_members     enable row level security;
alter table public.community_posts       enable row level security;
alter table public.community_replies     enable row level security;
alter table public.community_events      enable row level security;
alter table public.community_event_rsvps enable row level security;
alter table public.community_invites     enable row level security;

drop policy if exists cm_read on public.communities;
create policy cm_read on public.communities for select to authenticated using (public.orbit_member());
drop policy if exists cmm_read on public.community_members;
create policy cmm_read on public.community_members for select to authenticated using (public.orbit_member());
drop policy if exists cmp_read on public.community_posts;
create policy cmp_read on public.community_posts for select to authenticated using (public.orbit_member());
drop policy if exists cmp_insert on public.community_posts;
create policy cmp_insert on public.community_posts for insert to authenticated
  with check (author_id = auth.uid() and public.orbit_can_act() and public.community_role(community_id) is not null);
drop policy if exists cmp_delete on public.community_posts;
create policy cmp_delete on public.community_posts for delete to authenticated
  using (author_id = auth.uid() or public.community_manager(community_id));
drop policy if exists cmr_read on public.community_replies;
create policy cmr_read on public.community_replies for select to authenticated using (public.orbit_member());
drop policy if exists cmr_insert on public.community_replies;
create policy cmr_insert on public.community_replies for insert to authenticated
  with check (author_id = auth.uid() and public.orbit_can_act()
    and exists (select 1 from public.community_posts p where p.id = post_id and public.community_role(p.community_id) is not null));
drop policy if exists cmr_delete on public.community_replies;
create policy cmr_delete on public.community_replies for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.community_posts p where p.id = post_id and public.community_manager(p.community_id)));
drop policy if exists cme_read on public.community_events;
create policy cme_read on public.community_events for select to authenticated using (public.orbit_member());
drop policy if exists cme_insert on public.community_events;
create policy cme_insert on public.community_events for insert to authenticated
  with check (created_by = auth.uid() and public.community_manager(community_id));
drop policy if exists cme_delete on public.community_events;
create policy cme_delete on public.community_events for delete to authenticated using (public.community_manager(community_id));
drop policy if exists cer_read on public.community_event_rsvps;
create policy cer_read on public.community_event_rsvps for select to authenticated using (public.orbit_member());
drop policy if exists cer_insert on public.community_event_rsvps;
create policy cer_insert on public.community_event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and public.orbit_can_act()
    and exists (select 1 from public.community_events e where e.id = event_id and public.community_role(e.community_id) is not null));
drop policy if exists cer_delete on public.community_event_rsvps;
create policy cer_delete on public.community_event_rsvps for delete to authenticated using (user_id = auth.uid());
drop policy if exists cmi_read on public.community_invites;
create policy cmi_read on public.community_invites for select to authenticated using (invited_user = auth.uid() or invited_by = auth.uid());
drop policy if exists cmi_delete on public.community_invites;
create policy cmi_delete on public.community_invites for delete to authenticated using (invited_user = auth.uid());
-- no insert / update policy on communities, community_members or community_invites: only the functions below write them

-- ───────── functions ─────────
create or replace function public.join_community(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot join communities right now.'; end if;
  if not exists (select 1 from communities where id = p_id) then raise exception 'Community not found.'; end if;
  insert into community_members (community_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  delete from community_invites where community_id = p_id and invited_user = auth.uid();
end $$;

create or replace function public.leave_community(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select role into r from community_members where community_id = p_id and user_id = auth.uid();
  if r is null then return; end if;
  if r = 'owner' and exists (select 1 from community_members where community_id = p_id and user_id <> auth.uid()) then
    -- hand the community to the longest-standing member instead of leaving it without an owner
    update community_members set role = 'owner'
      where (community_id, user_id) = (select community_id, user_id from community_members where community_id = p_id and user_id <> auth.uid() order by joined_at limit 1);
  end if;
  delete from community_members where community_id = p_id and user_id = auth.uid();
  if not exists (select 1 from community_members where community_id = p_id) and exists (select 1 from communities where id = p_id and created_by is not null) then
    delete from communities where id = p_id;   -- the last member left a member-made community
  end if;
end $$;

create or replace function public.create_community(p_name text, p_description text, p_category text, p_icon text, p_color text, p_tags text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; tg text[];
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot create communities right now.'; end if;
  if (select count(*) from communities where created_by = auth.uid()) >= 5 and not public.orbit_staff() then
    raise exception 'You can own up to 5 communities.';
  end if;
  select coalesce(array_agg(t), '{}') into tg from (select distinct left(trim(x), 16) t from unnest(coalesce(p_tags, '{}')) x where trim(x) <> '' limit 4) s;
  insert into communities (name, description, category, icon, color, tags, created_by)
    values (public.orbit_clean(trim(p_name)), public.orbit_clean(coalesce(p_description, '')), coalesce(p_category, 'other'),
            coalesce(nullif(trim(p_icon), ''), '🌐'), coalesce(p_color, '#4c6fff'), tg, auth.uid())
    returning id into cid;
  insert into community_members (community_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
exception when unique_violation then raise exception 'A community with that name already exists.';
end $$;

create or replace function public.invite_to_community(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.community_role(p_id) is null then raise exception 'Join the community first to invite people.'; end if;
  if p_user = auth.uid() then return; end if;
  if exists (select 1 from community_members where community_id = p_id and user_id = p_user) then raise exception 'They are already a member.'; end if;
  if not exists (select 1 from server_members where server_id = public.main_server() and user_id = p_user) then raise exception 'That person is not in Orbit.'; end if;
  insert into community_invites (community_id, invited_user, invited_by) values (p_id, p_user, auth.uid()) on conflict do nothing;
end $$;

-- how many people joined each community this week (drives "Trending Now")
create or replace function public.community_week_joins() returns table (community_id uuid, joins bigint)
language sql stable security definer set search_path = public as $$
  select community_id, count(*) from community_members
  where public.orbit_member() and joined_at > now() - interval '7 days' group by community_id $$;

revoke execute on function
  public.community_role(uuid), public.community_manager(uuid), public.join_community(uuid), public.leave_community(uuid),
  public.create_community(text, text, text, text, text, text[]), public.invite_to_community(uuid, uuid), public.community_week_joins()
  from public, anon;
grant execute on function
  public.community_role(uuid), public.community_manager(uuid), public.join_community(uuid), public.leave_community(uuid),
  public.create_community(text, text, text, text, text, text[]), public.invite_to_community(uuid, uuid), public.community_week_joins()
  to authenticated;

-- ───────── image storage for the Media tab (public read, people write only inside their own folder) ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
drop policy if exists cmedia_insert on storage.objects;
create policy cmedia_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists cmedia_delete on storage.objects;
create policy cmedia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────── starter communities (member-less; people join them for real) ─────────
insert into public.communities (name, description, category, icon, color, tags, verified)
select v.* from (values
  ('Pokémon VGC',      'Strategy, teams, and tournaments for Pokémon VGC enthusiasts.', 'gaming', '🔥', '#ff6a3d', array['Gaming','Competitive'], true),
  ('Anime & Manga',    'Discuss your favorite series, share art, and meet fellow fans.', 'anime',  '🌸', '#a855f7', array['Anime','Manga'], true),
  ('Art & Design',     'Share your art, get feedback, and find creative inspiration.',   'art',    '🎨', '#f59e0b', array['Art','Creative'], true),
  ('Gaming',           'All games. All platforms. One community.',                       'gaming', '🎮', '#4c6fff', array['PC','Console','Mobile'], true),
  ('Minecraft Builders','Builds, survival, and creative projects.',                      'gaming', '🧱', '#3ea74f', array['Gaming','Building'], false),
  ('Genshin Impact',   'Events, builds, and character discussion.',                      'gaming', '✨', '#38bdf8', array['Gaming','RPG'], false),
  ('Valorant Hub',     'Tips, team finding, and esports.',                               'gaming', '🎯', '#ef4444', array['Gaming','Esports'], false),
  ('Music Lovers',     'Share music, artists, and playlists.',                           'music',  '🎵', '#ec4899', array['Music','Playlists'], false),
  ('Science & Tech',   'Ideas, innovations, and cool discoveries.',                      'tech',   '⚛️', '#06b6d4', array['Science','Tech'], false),
  ('Photography',      'Share your shots and get feedback.',                             'art',    '📷', '#8b5cf6', array['Photos','Art'], false)
) as v(name, description, category, icon, color, tags, verified)
where not exists (select 1 from public.communities c where lower(c.name) = lower(v.name));

-- ───────── realtime ─────────
alter table public.community_members replica identity full;
alter table public.community_event_rsvps replica identity full;

do $rt$
declare t text;
begin
  foreach t in array array['communities', 'community_members', 'community_posts', 'community_replies', 'community_events', 'community_event_rsvps', 'community_invites'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $rt$;

-- ───────── Suggestions: a "Need help" type (replaces the old Support tab in the sidebar) ─────────
alter table public.suggestions drop constraint if exists suggestions_kind_check;
alter table public.suggestions add constraint suggestions_kind_check check (kind in ('suggestion', 'improvement', 'bug', 'help'));
create or replace function public.submit_suggestion(p_kind text, p_title text, p_body text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); sid uuid;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if p_kind is null or p_kind not in ('suggestion', 'improvement', 'bug', 'help') then raise exception 'Pick a type.'; end if;
  if char_length(t) < 3 or char_length(t) > 100 then raise exception 'The title must be 3 to 100 characters.'; end if;
  if char_length(b) > 1000 then raise exception 'Details can be at most 1000 characters.'; end if;
  if not public.is_owner() and (select count(*) from suggestions where author_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can send up to 5 suggestions a day. Try again tomorrow.';
  end if;
  insert into suggestions (author_id, kind, title, body) values (auth.uid(), p_kind, t, b) returning id into sid;
  insert into suggestion_votes (suggestion_id, user_id) values (sid, auth.uid());
  return sid;
end $$;
