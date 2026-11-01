-- Chatter: "Add GIFs" tab. Members can upload GIFs that everyone can send from the GIF picker.
-- Run once in Supabase Dashboard > SQL Editor, AFTER the other migrations. Safe to re-run.
-- Files live at  gifs/<uploader id>/<gif id>.gif  in a public bucket (3 MB, GIF only).
-- Everyone can see/send them; each person can delete their own; the owner can delete any.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gifs', 'gifs', true, 3145728, array['image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.user_gifs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 30),
  created_at timestamptz not null default now()
);
create index if not exists user_gifs_created_idx on public.user_gifs(created_at desc);
alter table public.user_gifs enable row level security;
revoke all on public.user_gifs from anon;
grant select, insert, delete on public.user_gifs to authenticated;

drop policy if exists ug_read   on public.user_gifs;
drop policy if exists ug_insert on public.user_gifs;
drop policy if exists ug_delete on public.user_gifs;
create policy ug_read   on public.user_gifs for select to authenticated using (true);
create policy ug_insert on public.user_gifs for insert to authenticated with check (user_id = auth.uid());
create policy ug_delete on public.user_gifs for delete to authenticated using (user_id = auth.uid() or public.is_owner());

-- At most 30 uploads per person (the owner is exempt).
create or replace function public.user_gifs_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() and (select count(*) from user_gifs where user_id = new.user_id) >= 30 then
    raise exception 'You can have at most 30 GIFs. Delete one first.';
  end if;
  return new;
end $$;
revoke execute on function public.user_gifs_limit() from public, anon, authenticated;
drop trigger if exists user_gifs_limit_trg on public.user_gifs;
create trigger user_gifs_limit_trg before insert on public.user_gifs for each row execute function public.user_gifs_limit();

-- Storage rules: upload only into your own folder as <uuid>.gif; delete your own (owner can delete any).
drop policy if exists gifs_insert on storage.objects;
drop policy if exists gifs_delete on storage.objects;
create policy gifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gifs' and (storage.foldername(name))[1] = auth.uid()::text and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.gif$');
create policy gifs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gifs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_owner()));
