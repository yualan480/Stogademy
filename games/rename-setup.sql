-- ===== Admin "Rename" button: rename a player everywhere =====
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- (Run admin-setup.sql and names-setup.sql first if you haven't.)
-- Admins and owners only. Moves the player's scores, chat messages, MVP adjustments, mute/ban record,
-- reserved name and (for Google sign-ins) the saved profile name over to the new name.

create or replace function admin_rename_player(old_name text, new_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  o text := btrim(coalesce(old_name, ''));
  n text := btrim(coalesce(new_name, ''));
  ok text := lower(o);
  nk text := lower(n);
begin
  if not has_level('admin') then raise exception 'Not allowed'; end if;
  if o = '' then raise exception 'No player selected'; end if;
  if n = '' then raise exception 'Username cannot be empty'; end if;
  if length(n) > 12 then raise exception 'Username must be 12 characters or fewer'; end if;

  -- the new name must be free (changing only capital letters of the same name is fine)
  if nk <> ok and (
       exists (select 1 from player_names where key = nk)
    or exists (select 1 from scores where lower(btrim(name)) = nk)
    or exists (select 1 from chat_messages where lower(btrim(name)) = nk)
    or exists (select 1 from player_status where name = nk)
    or exists (select 1 from staff where lower(btrim(coalesce(chat_name, ''))) = nk)
  ) then raise exception 'The name "%" is already taken', n; end if;

  -- one audit line instead of one per changed row
  perform set_config('app.bulk', '1', true);

  update scores            set name = n where lower(btrim(name)) = ok;
  update chat_messages     set name = n where lower(btrim(name)) = ok;
  update mvp_adjustments   set name = n where lower(btrim(name)) = ok;
  update player_names      set key = nk, name = n where key = ok;
  update player_status     set name = nk, display = n, updated_at = now() where name = ok;

  -- Google sign-ins keep their name in the synced profile; update it so the player's devices pick up the new name
  update profiles
     set data = jsonb_set(data, '{keys,player-name}',
           jsonb_build_object('v', n, 't', (extract(epoch from clock_timestamp()) * 1000)::bigint))
   where lower(btrim(data -> 'keys' -> 'player-name' ->> 'v')) = ok;

  insert into admin_log(actor, action, target, detail)
  values (auth.jwt() ->> 'email', 'RENAME_PLAYER', o, jsonb_build_object('from', o, 'to', n));
end $$;

revoke all on function admin_rename_player(text, text) from public;
grant execute on function admin_rename_player(text, text) to authenticated;
