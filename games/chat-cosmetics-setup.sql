-- PRIZE ROOM: show profile frames and badges in chat for everyone (also when the owner is offline).
-- Run once in the Supabase SQL editor. Safe to re-run. Until it is run, chat still works and frames/badges
-- show for the players who are online right now; the site checks for these columns and uses them when they exist.
alter table public.chat_messages
  add column if not exists fr text,
  add column if not exists bd text;
do $$ begin
  alter table public.chat_messages add constraint chat_msg_fr_ck
    check (fr is null or fr in ('bronze','silver','ice','neon','dots','gold','flame','rainbow'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.chat_messages add constraint chat_msg_bd_ck
    check (bd is null or bd in ('star','joystick','heart','bolt','ghost','trophy','gem','crown'));
exception when duplicate_object then null; end $$;
-- only needed if your project grants INSERT column by column (harmless otherwise)
grant insert (fr, bd) on public.chat_messages to anon, authenticated;
grant select (fr, bd) on public.chat_messages to anon, authenticated;
