-- Run in the GAMES Supabase project SQL editor (ysopxengerkvbwhrdnwq).
-- Preserves the existing allowed games and includes Slither in MVP totals.
begin;
do $$
declare existing_check text; existing_view text;
begin
  select pg_get_constraintdef(oid) into existing_check
    from pg_constraint where conrelid = 'public.scores'::regclass and conname = 'scores_game_check';
  if existing_check is not null and position('''slither''' in existing_check) = 0 then
    alter table public.scores drop constraint scores_game_check;
    execute 'alter table public.scores add constraint scores_game_check ' ||
      regexp_replace(existing_check, '^CHECK \((.*)\)$', 'CHECK ((game = ''slither'') OR (\1))');
  end if;
  if to_regclass('public.player_mvp_points') is not null then
    select pg_get_viewdef('public.player_mvp_points'::regclass, true) into existing_view;
    if position('''slither''' in existing_view) = 0 then
      existing_view := replace(existing_view, 's.game = ANY (ARRAY[', 's.game = ANY (ARRAY[''slither''::text, ');
      execute 'create or replace view public.player_mvp_points as ' || existing_view;
    end if;
  end if;
end $$;
insert into public.games_config(id,title,page,sort_order)
values ('slither','Slither','slither.html',15) on conflict (id) do nothing;
commit;
