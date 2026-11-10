-- Run once in the GAMES Supabase SQL editor (ysopxengerkvbwhrdnwq).
-- Enables both Slither and Wordle score submissions, preserving existing allowed games.
begin;
do $$
declare existing_check text;
begin
  select pg_get_constraintdef(oid) into existing_check from pg_constraint
    where conrelid='public.scores'::regclass and conname='scores_game_check';
  if existing_check is not null and (position('''wordle''' in existing_check)=0 or position('''slither''' in existing_check)=0) then
    alter table public.scores drop constraint scores_game_check;
    execute 'alter table public.scores add constraint scores_game_check ' ||
      regexp_replace(existing_check, '^CHECK \((.*)\)$', 'CHECK ((game IN (''wordle'', ''slither'')) OR (\1))');
  end if;
end $$;
insert into public.games_config(id,title,page,sort_order)
values ('wordle','Wordle','wordle.html',16),('slither','Slither','slither.html',15)
on conflict (id) do nothing;
commit;
