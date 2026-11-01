-- CONSOLE BACK SETUP: run once in Supabase > SQL Editor (already applied to the "Unblocker4school" project). Safe to re-run.
-- Adds the posts that live on the BACK of the console. Everyone can read them; ONLY the owner account below can
-- create, edit or delete them (and upload their attachments). This is enforced by the database, not by the web page.

-- ===== who counts as the owner: this Google account, signed in through Google =====
-- To change the owner later, edit the email in this function and re-run this file.
create or replace function public.console_owner() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'role','') = 'authenticated'
     and coalesce(auth.jwt()->'app_metadata'->>'provider','') = 'google'
     and lower(coalesce(auth.jwt()->>'email','')) = 'yualan480@gmail.com' $$;
revoke all on function public.console_owner() from public;
grant execute on function public.console_owner() to anon, authenticated;

-- ===== the posts =====
create table if not exists public.console_posts(
  id bigint generated always as identity primary key,
  body text not null default '' check (char_length(body) <= 2000),
  attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6 and pg_column_size(attachments) < 6000),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0)
);
alter table public.console_posts enable row level security;
drop policy if exists cp_read  on public.console_posts; create policy cp_read  on public.console_posts for select using (true);
drop policy if exists cp_ins   on public.console_posts; create policy cp_ins   on public.console_posts for insert to authenticated with check (public.console_owner());
drop policy if exists cp_upd   on public.console_posts; create policy cp_upd   on public.console_posts for update to authenticated using (public.console_owner()) with check (public.console_owner());
drop policy if exists cp_del   on public.console_posts; create policy cp_del   on public.console_posts for delete to authenticated using (public.console_owner());
revoke all on public.console_posts from anon, authenticated;
grant select on public.console_posts to anon, authenticated;
grant insert, update, delete on public.console_posts to authenticated;
-- every change is recorded in the admin log like the other staff actions
drop trigger if exists trg_audit on public.console_posts;
create trigger trg_audit after insert or update or delete on public.console_posts for each row execute function public.audit();

-- ===== attachments: a public-read file bucket that only the owner can write to =====
insert into storage.buckets (id, name, public, file_size_limit) values ('console-posts', 'console-posts', true, 20971520)
  on conflict (id) do update set public = true, file_size_limit = 20971520;
drop policy if exists console_files_ins on storage.objects;
create policy console_files_ins on storage.objects for insert to authenticated with check (bucket_id = 'console-posts' and public.console_owner());
drop policy if exists console_files_upd on storage.objects;
create policy console_files_upd on storage.objects for update to authenticated using (bucket_id = 'console-posts' and public.console_owner()) with check (bucket_id = 'console-posts' and public.console_owner());
drop policy if exists console_files_del on storage.objects;
create policy console_files_del on storage.objects for delete to authenticated using (bucket_id = 'console-posts' and public.console_owner());
