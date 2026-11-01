-- Orbit: #tutorials becomes a page where members add tutorial videos (not a chat).
-- Run in Supabase (Orbit project). Safe to run more than once.

create table if not exists public.tutorials (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null check (char_length(title) between 3 and 100),
  game       text not null default '' check (char_length(game) <= 40),
  video      jsonb not null,                       -- { path, name, type, size } in the "attachments" bucket
  created_at timestamptz not null default now()
);
create index if not exists tutorials_created_idx on public.tutorials(created_at desc);

alter table public.tutorials enable row level security;
revoke all on public.tutorials from anon, authenticated;
grant select on public.tutorials to authenticated;
drop policy if exists tut_read on public.tutorials;
create policy tut_read on public.tutorials for select to authenticated
  using (public.server_role(public.main_server()) is not null);

-- hide bad words like everywhere else, and run the moderation check on the title and game
create or replace function public.tutorials_mask() returns trigger language plpgsql security definer set search_path = public as $f$
begin new.title := public.mask_profanity(new.title); new.game := public.mask_profanity(new.game); return new; end $f$;
drop trigger if exists aa_tutorials_mask_trg on public.tutorials;
create trigger aa_tutorials_mask_trg before insert or update of title, game on public.tutorials
  for each row execute function public.tutorials_mask();
drop trigger if exists mod_guard_tutorials on public.tutorials;
create trigger mod_guard_tutorials before insert or update of title, game on public.tutorials
  for each row execute function public.mod_trg_simple('attachment', 'title', 'game');

-- add a tutorial: the video must already be uploaded to the attachments bucket under the #tutorials folder, in the member's own folder
create or replace function public.add_tutorial(p_title text, p_game text, p_video jsonb) returns uuid
language plpgsql security definer set search_path = public as $f$
declare t text := btrim(coalesce(p_title, '')); g text := btrim(coalesce(p_game, '')); cid uuid; pth text; tid uuid;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if char_length(t) < 3 or char_length(t) > 100 then raise exception 'The title must be 3 to 100 characters.'; end if;
  if char_length(g) > 40 then raise exception 'The game name can be at most 40 characters.'; end if;
  select id into cid from channels where special = 'videos' order by created_at limit 1;
  if cid is null then raise exception 'The tutorials page is not set up yet.'; end if;
  pth := coalesce(p_video->>'path', '');
  if coalesce(p_video->>'type', '') not in ('video/mp4', 'video/webm') then raise exception 'Only mp4 or webm videos can be added.'; end if;
  if pth not like cid::text || '/' || auth.uid()::text || '/%' then raise exception 'That video was not uploaded correctly. Try again.'; end if;
  if not public.is_owner() and (select count(*) from tutorials where author_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can add up to 10 tutorials a day. Try again tomorrow.';
  end if;
  insert into tutorials (author_id, title, game, video)
    values (auth.uid(), t, g, jsonb_build_object('path', pth, 'name', left(coalesce(p_video->>'name', 'tutorial'), 120), 'type', p_video->>'type', 'size', coalesce((p_video->>'size')::bigint, 0)))
    returning id into tid;
  return tid;
end $f$;

-- delete a tutorial (your own, or any as an admin)
create or replace function public.delete_tutorial(p_id uuid) returns void
language plpgsql security definer set search_path = public as $f$
declare s tutorials;
begin
  select * into s from tutorials where id = p_id;
  if s.id is null then raise exception 'Tutorial not found.'; end if;
  if not (s.author_id = auth.uid() or public.is_admin(public.main_server())) then raise exception 'You can only delete your own tutorials.'; end if;
  delete from tutorials where id = p_id;
  delete from storage.objects where bucket_id = 'attachments' and name = s.video->>'path';
end $f$;

revoke execute on function public.add_tutorial(text, text, jsonb), public.delete_tutorial(uuid) from public, anon;
grant  execute on function public.add_tutorial(text, text, jsonb), public.delete_tutorial(uuid) to authenticated;

-- keep the old tutorials that were posted as chat messages: they show up on the page
insert into public.tutorials (author_id, title, game, video, created_at)
select m.author_id,
       coalesce(nullif(left(btrim(m.content), 100), ''), left(a->>'name', 100), 'Tutorial'),
       '', jsonb_build_object('path', a->>'path', 'name', a->>'name', 'type', a->>'type', 'size', coalesce((a->>'size')::bigint, 0)), m.created_at
from public.messages m
join public.channels c on c.id = m.channel_id and c.special = 'videos'
cross join lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) a
where coalesce(a->>'type', '') like 'video/%' and char_length(coalesce(nullif(left(btrim(m.content), 100), ''), left(a->>'name', 100), 'Tutorial')) >= 3
  and not exists (select 1 from public.tutorials t where t.video->>'path' = a->>'path');

-- #tutorials is no longer a chat: nothing can be posted there as a message
create or replace function public.messages_special_channels() returns trigger
language plpgsql security definer set search_path = public as $f$
declare sp text;
begin
  if new.channel_id is null then return new; end if;
  select special into sp from channels where id = new.channel_id;
  if sp = 'suggestions' then raise exception 'Use the Suggestions board here. Chat messages are not allowed in #suggestions.'; end if;
  if sp = 'videos' then raise exception 'Use the Tutorials page to add a video. Chat messages are not allowed in #tutorials.'; end if;
  return new;
end $f$;

-- live updates
do $$ begin
  begin alter publication supabase_realtime add table public.tutorials; exception when duplicate_object then null; when undefined_object then null; end;
end $$;
