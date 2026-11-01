-- Orbit Home: lets the owner, admins and moderators EDIT an announcement (title, details, pinned).
-- Run once in the ORBIT Supabase project (SQL Editor). Safe to re-run.
create or replace function public.edit_announcement(p_id uuid, p_title text, p_body text default '', p_pinned boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, ''));
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can edit announcements.'; end if;
  if char_length(t) < 1 or char_length(t) > 120 then raise exception 'The title must be 1 to 120 characters.'; end if;
  if char_length(b) > 2000 then raise exception 'The text can be at most 2000 characters.'; end if;
  update announcements set title = public.orbit_clean(t), body = public.orbit_clean(b), pinned = coalesce(p_pinned, false) where id = p_id;
  if not found then raise exception 'That announcement no longer exists.'; end if;
end $$;
revoke all on function public.edit_announcement(uuid, text, text, boolean) from public;
grant execute on function public.edit_announcement(uuid, text, text, boolean) to authenticated;
