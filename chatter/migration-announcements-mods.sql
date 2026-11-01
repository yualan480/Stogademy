-- Chatter: let moderators (and admins) post in #announcements. Everyone else can only read it.
-- (Already applied to your Chatter4school database; this file is a record so the project matches.)
-- A channel marked owner_only can set admins_can_post and/or mods_can_post = true. mods_can_post lets moderators AND admins post.
-- Also fixes messages_guard() so it honours admins_can_post, not just the can_post() check.
alter table public.channels add column if not exists admins_can_post boolean not null default false;
alter table public.channels add column if not exists mods_can_post   boolean not null default false;
update public.channels set admins_can_post = true, mods_can_post = true where kind = 'text' and lower(name) = 'announcements';
-- The posting checks in messages_guard() and can_post() now read:
--   c.owner_only and not (sm.role = 'owner' or (c.admins_can_post and sm.role = 'admin') or (c.mods_can_post and sm.role in ('admin', 'moderator')))
