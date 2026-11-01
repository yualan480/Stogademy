-- Orbit Communities: admin tools (edit, verify, manage members, delete), the same way staff manage tournaments.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it AFTER migration-communities.sql.
--
-- Who can do what:
--   Orbit staff (owner, admins, moderators; the same people who run tournaments): edit, verify, delete ANY community,
--     change community roles and remove members, even without joining the community.
--   a community's own owner: edit and delete their community, hand out moderator / owner roles, remove members.
--   a community's moderators: remove regular members (they cannot touch the owner or other moderators).
-- Everything goes through the functions below, so member counts and roles always stay right.

-- ───────── edit a community ─────────
create or replace function public.update_community(
  p_id uuid, p_name text, p_description text, p_category text, p_icon text, p_color text, p_tags text[], p_verified boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
declare tg text[]; staff boolean := public.orbit_staff();
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from communities where id = p_id) then raise exception 'Community not found.'; end if;
  if not (staff or public.community_role(p_id) = 'owner') then
    raise exception 'Only the community owner, admins and moderators can edit a community.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Give it a name (2+ characters).'; end if;
  if coalesce(p_category, 'other') not in ('gaming', 'anime', 'art', 'music', 'tech', 'other') then raise exception 'Pick a valid category.'; end if;
  if coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Pick a valid colour.'; end if;
  select coalesce(array_agg(t), '{}') into tg
    from (select distinct left(trim(x), 16) t from unnest(coalesce(p_tags, '{}')) x where trim(x) <> '' limit 4) s;
  update communities set
    name        = public.orbit_clean(trim(p_name)),
    description = public.orbit_clean(coalesce(p_description, '')),
    category    = coalesce(p_category, 'other'),
    icon        = coalesce(nullif(trim(p_icon), ''), '🌐'),
    color       = p_color,
    tags        = tg,
    verified    = case when staff and p_verified is not null then p_verified else verified end
  where id = p_id;
exception when unique_violation then raise exception 'A community with that name already exists.';
end $$;

-- ───────── delete a community (posts, events and members go with it) ─────────
create or replace function public.delete_community(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not (public.orbit_staff() or public.community_role(p_id) = 'owner') then
    raise exception 'Only the community owner, admins and moderators can delete a community.';
  end if;
  delete from communities where id = p_id;
end $$;

-- ───────── change someone's role: member <-> moderator, or hand over ownership ─────────
create or replace function public.set_community_role(p_id uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if not (public.orbit_staff() or public.community_role(p_id) = 'owner') then
    raise exception 'Only the community owner, admins and moderators can change roles.';
  end if;
  if p_role not in ('owner', 'moderator', 'member') then raise exception 'Unknown role.'; end if;
  if not exists (select 1 from community_members where community_id = p_id and user_id = p_user) then
    raise exception 'That person is not in this community.';
  end if;
  if p_role = 'owner' then
    -- one owner at a time: the old owner stays on as a moderator
    update community_members set role = 'moderator' where community_id = p_id and role = 'owner' and user_id <> p_user;
  elsif exists (select 1 from community_members where community_id = p_id and user_id = p_user and role = 'owner')
        and not exists (select 1 from community_members where community_id = p_id and role = 'owner' and user_id <> p_user) then
    raise exception 'Make someone else the owner first.';
  end if;
  update community_members set role = p_role where community_id = p_id and user_id = p_user;
end $$;

-- ───────── remove a member ─────────
create or replace function public.remove_community_member(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mine text := public.community_role(p_id); theirs text;
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  select role into theirs from community_members where community_id = p_id and user_id = p_user;
  if theirs is null then return; end if;
  if p_user = auth.uid() then raise exception 'Use Leave community to leave.'; end if;
  if theirs = 'owner' then raise exception 'Make someone else the owner before removing the owner.'; end if;
  if not (public.orbit_staff() or mine = 'owner' or (mine = 'moderator' and theirs = 'member')) then
    raise exception 'You cannot remove that person.';
  end if;
  delete from community_members where community_id = p_id and user_id = p_user;
  delete from community_invites where community_id = p_id and invited_user = p_user;
end $$;

revoke execute on function
  public.update_community(uuid, text, text, text, text, text, text[], boolean), public.delete_community(uuid),
  public.set_community_role(uuid, uuid, text), public.remove_community_member(uuid, uuid)
  from public, anon;
grant execute on function
  public.update_community(uuid, text, text, text, text, text, text[], boolean), public.delete_community(uuid),
  public.set_community_role(uuid, uuid, text), public.remove_community_member(uuid, uuid)
  to authenticated;
