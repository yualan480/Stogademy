-- Orbit Tournaments: browse, register, brackets / leaderboards, and an admin dashboard.
-- Run ONCE in the ORBIT Supabase project: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Run it after migration-orbits-unified.sql (prizes are paid through the same Orbits ledger).
--
--  tournaments          one row per tournament. Only staff (owner, admins, moderators) can create or change them.
--  tournament_players   who signed up. Players join / leave through functions, never by writing the table.
--  tournament_matches   bracket matches (single elimination).
--  tournament_scores    score entries for leaderboard tournaments (players submit, staff approve).
--
-- Games: tournaments can only use games that are on Orbit Games. The list is in tournament_games() below.
-- When a new game is added to Orbit Games, add its id to that list (and to GAMES in tournaments.js) and run this file again.
-- Prizes: placements pay Orbits through the ledger (1st 100, 2nd 50, 3rd 25, the same amounts as Orbit event prizes).

-- ───────── 0. the Orbit Games list ─────────
create or replace function public.tournament_games() returns text[]
language sql immutable as $$
  select array['game2048','blockblast','breakout','dino','flappy','geodash','girder','minesweeper','pacman','slope','snake','tetris','sudoku',
               'battleship','chess','draw','archery','breakout2p'] $$;

-- ───────── 1. tables ─────────
create table if not exists public.tournaments (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 3 and 80),
  game          text not null,
  format        text not null default 'bracket' check (format in ('bracket', 'leaderboard')),
  description   text not null default '' check (char_length(description) <= 1500),
  rules         text not null default '' check (char_length(rules) <= 3000),
  starts_at     timestamptz not null,
  reg_closes_at timestamptz,
  max_players   int not null default 16 check (max_players between 2 and 64),
  prize_text    text not null default '' check (char_length(prize_text) <= 200),
  orbit_prizes  boolean not null default true,
  status        text not null default 'draft' check (status in ('draft', 'open', 'live', 'completed', 'cancelled')),
  prizes_paid   boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tournaments_starts on public.tournaments (starts_at);

create table if not exists public.tournament_players (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'registered' check (status in ('registered', 'disqualified')),
  seed          int,
  placement     int,
  registered_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists tournament_players_user on public.tournament_players (user_id);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         int not null,
  slot          int not null,
  p1            uuid references public.profiles(id) on delete set null,
  p2            uuid references public.profiles(id) on delete set null,
  s1            int check (s1 is null or s1 between 0 and 1000000),
  s2            int check (s2 is null or s2 between 0 and 1000000),
  winner        uuid references public.profiles(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'ready', 'done')),
  unique (tournament_id, round, slot)
);

create table if not exists public.tournament_scores (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  score         bigint not null check (score between 0 and 1000000000),
  note          text not null default '' check (char_length(note) <= 200),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tournament_scores_t on public.tournament_scores (tournament_id, status);

-- ───────── 2. who can read what (writing is only through the functions below) ─────────
create or replace function public.tournament_visible(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments x where x.id = t and (x.status <> 'draft' or public.orbit_staff())) $$;

alter table public.tournaments        enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_scores  enable row level security;

drop policy if exists t_read on public.tournaments;
create policy t_read on public.tournaments for select to authenticated using (status <> 'draft' or public.orbit_staff());
drop policy if exists tp_read on public.tournament_players;
create policy tp_read on public.tournament_players for select to authenticated using (public.tournament_visible(tournament_id));
drop policy if exists tm_read on public.tournament_matches;
create policy tm_read on public.tournament_matches for select to authenticated using (public.tournament_visible(tournament_id));
drop policy if exists ts_read on public.tournament_scores;
create policy ts_read on public.tournament_scores for select to authenticated
  using (public.tournament_visible(tournament_id) and (status = 'approved' or user_id = auth.uid() or public.orbit_staff()));

revoke insert, update, delete on public.tournaments, public.tournament_players, public.tournament_matches, public.tournament_scores from anon, authenticated;
revoke all on public.tournaments, public.tournament_players, public.tournament_matches, public.tournament_scores from anon;
grant select on public.tournaments, public.tournament_players, public.tournament_matches, public.tournament_scores to authenticated;

-- ───────── 3. internal helpers ─────────
-- pay the Orbit prizes for the placements (once)
create or replace function public._t_pay(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  select * into t from tournaments where id = p_id for update;
  if t.id is null or t.prizes_paid or not t.orbit_prizes then return; end if;
  insert into orbit_ledger (user_id, amount, reason, ref)
    select tp.user_id,
           case tp.placement when 1 then 100 when 2 then 50 else 25 end,
           case tp.placement when 1 then 'tournament' when 2 then 'tournament_2nd' else 'tournament_3rd' end,
           'tournament:' || p_id::text
      from tournament_players tp
     where tp.tournament_id = p_id and tp.placement between 1 and 3 and tp.status = 'registered'
    on conflict (user_id, reason, ref) do nothing;
  update tournaments set prizes_paid = true where id = p_id;
end $$;
revoke all on function public._t_pay(uuid) from public, anon, authenticated;

-- put a finished match's winner into the next round
create or replace function public._t_advance(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m tournament_matches; nx tournament_matches;
begin
  select * into m from tournament_matches where id = p_match;
  if m.id is null or m.winner is null then return; end if;
  select * into nx from tournament_matches where tournament_id = m.tournament_id and round = m.round + 1 and slot = m.slot / 2;
  if nx.id is null then return; end if;
  if m.slot % 2 = 0 then update tournament_matches set p1 = m.winner where id = nx.id;
  else update tournament_matches set p2 = m.winner where id = nx.id; end if;
  update tournament_matches set status = case when p1 is not null and p2 is not null and winner is null then 'ready' when winner is not null then 'done' else 'pending' end
   where id = nx.id;
end $$;
revoke all on function public._t_advance(uuid) from public, anon, authenticated;

-- when the final is decided: set placements (1st, 2nd, and both semi-final losers share 3rd), close the tournament, pay prizes
create or replace function public._t_complete_bracket(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f tournament_matches; r int;
begin
  select max(round) into r from tournament_matches where tournament_id = p_id;
  select * into f from tournament_matches where tournament_id = p_id and round = r and slot = 0;
  if f.id is null or f.winner is null then return; end if;
  update tournament_players set placement = null where tournament_id = p_id;
  update tournament_players set placement = 1 where tournament_id = p_id and user_id = f.winner;
  update tournament_players set placement = 2 where tournament_id = p_id and user_id = case when f.p1 = f.winner then f.p2 else f.p1 end;
  if r >= 2 then
    update tournament_players tp set placement = 3
     where tp.tournament_id = p_id and tp.placement is null
       and tp.user_id in (select case when m.p1 = m.winner then m.p2 else m.p1 end from tournament_matches m
                           where m.tournament_id = p_id and m.round = r - 1 and m.winner is not null);
  end if;
  update tournaments set status = 'completed' where id = p_id;
  perform public._t_pay(p_id);
end $$;
revoke all on function public._t_complete_bracket(uuid) from public, anon, authenticated;

-- ───────── 4. staff: create / edit / status / delete ─────────
create or replace function public.tournament_save(p_id uuid, p_title text, p_game text, p_format text, p_description text, p_rules text,
  p_starts timestamptz, p_reg_closes timestamptz, p_max int, p_prize_text text, p_orbit_prizes boolean, p_publish boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); v_id uuid := p_id; cur tournaments;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can manage tournaments.'; end if;
  if char_length(t) < 3 or char_length(t) > 80 then raise exception 'The title must be 3 to 80 characters.'; end if;
  if p_game is null or not (p_game = any (public.tournament_games())) then raise exception 'Pick a game from Orbit Games.'; end if;
  if p_format not in ('bracket', 'leaderboard') then raise exception 'Unknown format.'; end if;
  if p_starts is null then raise exception 'Choose a start date.'; end if;
  if p_max is null or p_max < 2 or p_max > 64 then raise exception 'Players must be between 2 and 64.'; end if;
  if p_reg_closes is not null and p_reg_closes > p_starts + interval '30 days' then raise exception 'Registration should close around the start date.'; end if;
  if char_length(coalesce(p_description, '')) > 1500 or char_length(coalesce(p_rules, '')) > 3000 then raise exception 'The description or rules are too long.'; end if;
  if char_length(coalesce(p_prize_text, '')) > 200 then raise exception 'The prize note is too long.'; end if;
  t := public.orbit_clean(t);
  if v_id is null then
    insert into tournaments (title, game, format, description, rules, starts_at, reg_closes_at, max_players, prize_text, orbit_prizes, status, created_by)
      values (t, p_game, p_format, public.orbit_clean(btrim(coalesce(p_description, ''))), public.orbit_clean(btrim(coalesce(p_rules, ''))),
              p_starts, p_reg_closes, p_max, public.orbit_clean(btrim(coalesce(p_prize_text, ''))), coalesce(p_orbit_prizes, true),
              case when p_publish then 'open' else 'draft' end, auth.uid())
      returning id into v_id;
  else
    select * into cur from tournaments where id = v_id for update;
    if cur.id is null then raise exception 'Tournament not found.'; end if;
    if cur.status in ('live', 'completed') and (cur.game <> p_game or cur.format <> p_format) then raise exception 'The game and format cannot change once the tournament has started.'; end if;
    if p_max < (select count(*) from tournament_players where tournament_id = v_id and status = 'registered') then raise exception 'More players than that are already registered.'; end if;
    update tournaments set title = t, game = p_game, format = p_format,
        description = public.orbit_clean(btrim(coalesce(p_description, ''))), rules = public.orbit_clean(btrim(coalesce(p_rules, ''))),
        starts_at = p_starts, reg_closes_at = p_reg_closes, max_players = p_max,
        prize_text = public.orbit_clean(btrim(coalesce(p_prize_text, ''))), orbit_prizes = case when cur.prizes_paid then cur.orbit_prizes else coalesce(p_orbit_prizes, true) end,
        status = case when p_publish and cur.status = 'draft' then 'open' else cur.status end
      where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.tournament_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare cur tournaments;
begin
  if not public.orbit_staff() then raise exception 'Only staff can change a tournament.'; end if;
  if p_status not in ('draft', 'open', 'cancelled') then raise exception 'Use Start or Finish for that.'; end if;
  select * into cur from tournaments where id = p_id for update;
  if cur.id is null then raise exception 'Tournament not found.'; end if;
  if cur.status = 'completed' then raise exception 'This tournament is finished.'; end if;
  if cur.status = 'live' and p_status <> 'cancelled' then raise exception 'It has already started. You can cancel it, or finish it.'; end if;
  update tournaments set status = p_status where id = p_id;
end $$;

create or replace function public.tournament_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only staff can delete tournaments.'; end if;
  delete from tournaments where id = p_id;
end $$;

-- ───────── 5. players: sign up and withdraw ─────────
create or replace function public.tournament_register(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments; n int; mine tournament_players;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot sign up right now.'; end if;
  select * into t from tournaments where id = p_id for update;
  if t.id is null or t.status = 'draft' then raise exception 'Tournament not found.'; end if;
  if t.status <> 'open' then raise exception 'Sign-ups are not open for this tournament.'; end if;
  if t.reg_closes_at is not null and now() > t.reg_closes_at then raise exception 'Registration has closed.'; end if;
  select * into mine from tournament_players where tournament_id = p_id and user_id = auth.uid();
  if mine.user_id is not null then
    if mine.status = 'disqualified' then raise exception 'You were removed from this tournament.'; end if;
    return;   -- already in
  end if;
  select count(*) into n from tournament_players where tournament_id = p_id and status = 'registered';
  if n >= t.max_players then raise exception 'This tournament is full.'; end if;
  insert into tournament_players (tournament_id, user_id) values (p_id, auth.uid());
end $$;

create or replace function public.tournament_unregister(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  select * into t from tournaments where id = p_id;
  if t.id is null then raise exception 'Tournament not found.'; end if;
  if t.status <> 'open' then raise exception 'You can only withdraw before the tournament starts. Ask a staff member.'; end if;
  delete from tournament_players where tournament_id = p_id and user_id = auth.uid() and status = 'registered';
end $$;

-- staff: take a player out. Before the start they are deleted; after it they are disqualified (a bracket opponent advances).
create or replace function public.tournament_remove_player(p_id uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments; m tournament_matches; r int;
begin
  if not public.orbit_staff() then raise exception 'Only staff can remove players.'; end if;
  select * into t from tournaments where id = p_id for update;
  if t.id is null then raise exception 'Tournament not found.'; end if;
  if t.status = 'completed' then raise exception 'This tournament is finished.'; end if;
  if t.status in ('draft', 'open', 'cancelled') then
    delete from tournament_players where tournament_id = p_id and user_id = p_user; return;
  end if;
  update tournament_players set status = 'disqualified' where tournament_id = p_id and user_id = p_user;
  if t.format = 'bracket' then
    select * into m from tournament_matches where tournament_id = p_id and status = 'ready' and (p1 = p_user or p2 = p_user) limit 1;
    if m.id is not null then
      update tournament_matches set winner = case when p1 = p_user then p2 else p1 end, status = 'done' where id = m.id;
      perform public._t_advance(m.id);
      select max(round) into r from tournament_matches where tournament_id = p_id;
      if m.round = r then perform public._t_complete_bracket(p_id); end if;
    end if;
  end if;
end $$;

-- ───────── 6. start: build the bracket ─────────
create or replace function public.tournament_start(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments; n int; sz int := 2; rounds int := 1; ord int[] := array[1]; tmp int[]; len int; x int; k int; rr int;
        a uuid; b uuid; mid uuid; w uuid;
begin
  if not public.orbit_staff() then raise exception 'Only staff can start a tournament.'; end if;
  select * into t from tournaments where id = p_id for update;
  if t.id is null then raise exception 'Tournament not found.'; end if;
  if t.status <> 'open' then raise exception 'Only an open tournament can be started.'; end if;
  select count(*) into n from tournament_players where tournament_id = p_id and status = 'registered';
  if t.format = 'bracket' and n < 2 then raise exception 'A bracket needs at least 2 players.'; end if;
  if t.format = 'leaderboard' and n < 1 then raise exception 'Nobody has signed up yet.'; end if;
  if t.format = 'bracket' then
    while sz < n loop sz := sz * 2; rounds := rounds + 1; end loop;
    with s as (select user_id, row_number() over (order by random()) rn from tournament_players where tournament_id = p_id and status = 'registered')
      update tournament_players tp set seed = s.rn from s where tp.tournament_id = p_id and tp.user_id = s.user_id;
    while array_length(ord, 1) < sz loop           -- standard seeding: 1 meets the lowest seed, strong seeds stay apart
      tmp := '{}'; len := array_length(ord, 1);
      foreach x in array ord loop tmp := tmp || x || (len * 2 + 1 - x); end loop;
      ord := tmp;
    end loop;
    for k in 0 .. sz / 2 - 1 loop
      select user_id into a from tournament_players where tournament_id = p_id and seed = ord[2 * k + 1];
      select user_id into b from tournament_players where tournament_id = p_id and seed = ord[2 * k + 2];
      insert into tournament_matches (tournament_id, round, slot, p1, p2, status)
        values (p_id, 1, k, a, b, case when a is not null and b is not null then 'ready' else 'pending' end);
    end loop;
    for rr in 2 .. rounds loop
      for k in 0 .. (sz / (2 ^ rr)::int) - 1 loop
        insert into tournament_matches (tournament_id, round, slot, status) values (p_id, rr, k, 'pending');
      end loop;
    end loop;
    for mid, w in select id, coalesce(p1, p2) from tournament_matches where tournament_id = p_id and round = 1 and (p1 is null or p2 is null) loop
      update tournament_matches set winner = w, status = 'done' where id = mid;   -- a bye: the lone player moves on
      perform public._t_advance(mid);
    end loop;
  end if;
  update tournaments set status = 'live' where id = p_id;
end $$;

-- ───────── 7. results: bracket matches ─────────
create or replace function public.tournament_report(p_match uuid, p_s1 int, p_s2 int, p_winner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m tournament_matches; t tournaments; r int; nx tournament_matches;
begin
  if not public.orbit_staff() then raise exception 'Only staff can enter results.'; end if;
  select * into m from tournament_matches where id = p_match for update;
  if m.id is null then raise exception 'Match not found.'; end if;
  select * into t from tournaments where id = m.tournament_id;
  if t.status <> 'live' then raise exception 'This tournament is not live.'; end if;
  if m.p1 is null or m.p2 is null then raise exception 'Both players are not known yet.'; end if;
  if p_winner is null or p_winner not in (m.p1, m.p2) then raise exception 'Pick which player won.'; end if;
  select * into nx from tournament_matches where tournament_id = m.tournament_id and round = m.round + 1 and slot = m.slot / 2;
  if nx.id is not null and nx.status = 'done' then raise exception 'The next round has already been played. Fix that result first.'; end if;
  update tournament_matches set s1 = p_s1, s2 = p_s2, winner = p_winner, status = 'done' where id = p_match;
  perform public._t_advance(p_match);
  select max(round) into r from tournament_matches where tournament_id = m.tournament_id;
  if m.round = r then perform public._t_complete_bracket(m.tournament_id); end if;
end $$;

-- ───────── 8. results: leaderboard tournaments ─────────
create or replace function public.tournament_submit_score(p_id uuid, p_score bigint, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot submit a score right now.'; end if;
  select * into t from tournaments where id = p_id;
  if t.id is null or t.status <> 'live' or t.format <> 'leaderboard' then raise exception 'Scores are not being accepted for this tournament.'; end if;
  if not exists (select 1 from tournament_players where tournament_id = p_id and user_id = auth.uid() and status = 'registered') then raise exception 'You are not signed up for this tournament.'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then raise exception 'That score is not valid.'; end if;
  if (select count(*) from tournament_scores where tournament_id = p_id and user_id = auth.uid() and status = 'pending') >= 5 then raise exception 'You already have 5 scores waiting for review.'; end if;
  insert into tournament_scores (tournament_id, user_id, score, note) values (p_id, auth.uid(), p_score, public.orbit_clean(left(btrim(coalesce(p_note, '')), 200)));
end $$;

create or replace function public.tournament_review_score(p_score uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.orbit_staff() then raise exception 'Only staff can review scores.'; end if;
  update tournament_scores set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid() where id = p_score;
end $$;

create or replace function public.tournament_add_score(p_id uuid, p_user uuid, p_score bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  if not public.orbit_staff() then raise exception 'Only staff can add scores.'; end if;
  select * into t from tournaments where id = p_id;
  if t.id is null or t.status <> 'live' or t.format <> 'leaderboard' then raise exception 'This tournament is not a live leaderboard.'; end if;
  if not exists (select 1 from tournament_players where tournament_id = p_id and user_id = p_user and status = 'registered') then raise exception 'That player is not in this tournament.'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then raise exception 'That score is not valid.'; end if;
  insert into tournament_scores (tournament_id, user_id, score, status, reviewed_by) values (p_id, p_user, p_score, 'approved', auth.uid());
end $$;

-- finish a leaderboard tournament: best approved score wins (earlier score breaks a tie)
create or replace function public.tournament_finish(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments;
begin
  if not public.orbit_staff() then raise exception 'Only staff can finish a tournament.'; end if;
  select * into t from tournaments where id = p_id for update;
  if t.id is null then raise exception 'Tournament not found.'; end if;
  if t.status <> 'live' then raise exception 'Only a live tournament can be finished.'; end if;
  if t.format = 'bracket' then raise exception 'A bracket finishes by itself when the final result is entered.'; end if;
  if not exists (select 1 from tournament_scores where tournament_id = p_id and status = 'approved') then raise exception 'There are no approved scores yet.'; end if;
  update tournament_players set placement = null where tournament_id = p_id;
  with best as (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
      from tournament_scores s join tournament_players tp on tp.tournament_id = s.tournament_id and tp.user_id = s.user_id and tp.status = 'registered'
     where s.tournament_id = p_id and s.status = 'approved'
     order by s.user_id, s.score desc, s.created_at),
  ranked as (select user_id, row_number() over (order by score desc, created_at) place from best)
  update tournament_players tp set placement = ranked.place from ranked
   where tp.tournament_id = p_id and tp.user_id = ranked.user_id and ranked.place <= 3;
  update tournaments set status = 'completed' where id = p_id;
  perform public._t_pay(p_id);
end $$;

-- ───────── 9. who may call what ─────────
revoke all on function public.tournament_save(uuid, text, text, text, text, text, timestamptz, timestamptz, int, text, boolean, boolean) from public;
revoke all on function public.tournament_set_status(uuid, text) from public;
revoke all on function public.tournament_delete(uuid) from public;
revoke all on function public.tournament_register(uuid) from public;
revoke all on function public.tournament_unregister(uuid) from public;
revoke all on function public.tournament_remove_player(uuid, uuid) from public;
revoke all on function public.tournament_start(uuid) from public;
revoke all on function public.tournament_report(uuid, int, int, uuid) from public;
revoke all on function public.tournament_submit_score(uuid, bigint, text) from public;
revoke all on function public.tournament_review_score(uuid, boolean) from public;
revoke all on function public.tournament_add_score(uuid, uuid, bigint) from public;
revoke all on function public.tournament_finish(uuid) from public;
grant execute on function public.tournament_save(uuid, text, text, text, text, text, timestamptz, timestamptz, int, text, boolean, boolean) to authenticated;
grant execute on function public.tournament_set_status(uuid, text) to authenticated;
grant execute on function public.tournament_delete(uuid) to authenticated;
grant execute on function public.tournament_register(uuid) to authenticated;
grant execute on function public.tournament_unregister(uuid) to authenticated;
grant execute on function public.tournament_remove_player(uuid, uuid) to authenticated;
grant execute on function public.tournament_start(uuid) to authenticated;
grant execute on function public.tournament_report(uuid, int, int, uuid) to authenticated;
grant execute on function public.tournament_submit_score(uuid, bigint, text) to authenticated;
grant execute on function public.tournament_review_score(uuid, boolean) to authenticated;
grant execute on function public.tournament_add_score(uuid, uuid, bigint) to authenticated;
grant execute on function public.tournament_finish(uuid) to authenticated;
grant execute on function public.tournament_games() to authenticated;
grant execute on function public.tournament_visible(uuid) to authenticated;
