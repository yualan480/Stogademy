-- ===== Admin "Remove player" button =====
-- Already applied to the Unblocker4school project. Safe to run again.
create or replace function public.admin_remove_player(player_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text := lower(btrim(coalesce(player_name, '')));
  s int; c int;
begin
  if not has_level('admin') then raise exception 'Not allowed'; end if;
  if k = '' then raise exception 'No player selected'; end if;
  if exists (select 1 from staff where lower(btrim(coalesce(chat_name, ''))) = k) then
    raise exception 'That name belongs to a staff member';
  end if;
  perform set_config('app.bulk', '1', true);
  delete from scores          where lower(btrim(name)) = k;  get diagnostics s = row_count;
  delete from chat_messages   where lower(btrim(name)) = k;  get diagnostics c = row_count;
  delete from mvp_adjustments where lower(btrim(name)) = k;
  delete from player_status   where name = k;
  delete from player_names    where key = k;
  insert into admin_log(actor, action, target, detail)
  values (auth.jwt() ->> 'email', 'REMOVE_PLAYER', player_name, jsonb_build_object('scores_deleted', s, 'messages_deleted', c));
end $$;
revoke all on function public.admin_remove_player(text) from public, anon;
grant execute on function public.admin_remove_player(text) to authenticated;
