-- Orbit Tournaments: END DATE + AUTOMATIC SCORES.
-- Run ONCE in the ORBIT Supabase project (SQL Editor -> New query -> paste -> Run). Safe to run again.
-- Run it after migration-tournaments.sql.
--
--  1. Every tournament now has an END DATE (ends_at). Scores are only accepted from the start until the end.
--  2. Leaderboard tournaments record scores by themselves: once a player has ENTERED (signed up) and the tournament is live,
--     the NEXT score they get in that game is recorded as their score in the tournament, even if it is lower than their
--     personal best. After that, only a higher score replaces it. Scores from before they entered never count.

-- ───────── 1. end date ─────────
alter table public.tournaments add column if not exists ends_at timestamptz;
update public.tournaments set ends_at = starts_at + interval '7 days' where ends_at is null;   -- old tournaments get a week
alter table public.tournaments alter column ends_at set not null;
alter table public.tournaments drop constraint if exists tournaments_ends_after_start;
alter table public.tournaments add constraint tournaments_ends_after_start check (ends_at > starts_at);

drop function if exists public.tournament_save(uuid, text, text, text, text, text, timestamptz, timestamptz, int, text, boolean, boolean);
create or replace function public.tournament_save(p_id uuid, p_title text, p_game text, p_format text, p_description text, p_rules text,
  p_starts timestamptz, p_ends timestamptz, p_reg_closes timestamptz, p_max int, p_prize_text text, p_orbit_prizes boolean, p_publish boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_title, '')); v_id uuid := p_id; cur tournaments;
begin
  if not public.orbit_staff() then raise exception 'Only the owner, admins and moderators can manage tournaments.'; end if;
  if char_length(t) < 3 or char_length(t) > 80 then raise exception 'The title must be 3 to 80 characters.'; end if;
  if p_game is null or not (p_game = any (public.tournament_games())) then raise exception 'Pick a game from Orbit Games.'; end if;
  if p_format not in ('bracket', 'leaderboard') then raise exception 'Unknown format.'; end if;
  if p_starts is null then raise exception 'Choose a start date.'; end if;
  if p_ends is null then raise exception 'Choose an end date.'; end if;
  if p_ends <= p_starts then raise exception 'The end date must be after the start date.'; end if;
  if p_max is null or p_max < 2 or p_max > 64 then raise exception 'Players must be between 2 and 64.'; end if;
  if p_reg_closes is not null and p_reg_closes > p_ends then raise exception 'Sign-ups must close before the tournament ends.'; end if;
  if char_length(coalesce(p_description, '')) > 1500 or char_length(coalesce(p_rules, '')) > 3000 then raise exception 'The description or rules are too long.'; end if;
  if char_length(coalesce(p_prize_text, '')) > 200 then raise exception 'The prize note is too long.'; end if;
  t := public.orbit_clean(t);
  if v_id is null then
    insert into tournaments (title, game, format, description, rules, starts_at, ends_at, reg_closes_at, max_players, prize_text, orbit_prizes, status, created_by)
      values (t, p_game, p_format, public.orbit_clean(btrim(coalesce(p_description, ''))), public.orbit_clean(btrim(coalesce(p_rules, ''))),
              p_starts, p_ends, p_reg_closes, p_max, public.orbit_clean(btrim(coalesce(p_prize_text, ''))), coalesce(p_orbit_prizes, true),
              case when p_publish then 'open' else 'draft' end, auth.uid())
      returning id into v_id;
  else
    select * into cur from tournaments where id = v_id for update;
    if cur.id is null then raise exception 'Tournament not found.'; end if;
    if cur.status in ('live', 'completed') and (cur.game <> p_game or cur.format <> p_format) then raise exception 'The game and format cannot change once the tournament has started.'; end if;
    if p_max < (select count(*) from tournament_players where tournament_id = v_id and status = 'registered') then raise exception 'More players than that are already registered.'; end if;
    update tournaments set title = t, game = p_game, format = p_format,
        description = public.orbit_clean(btrim(coalesce(p_description, ''))), rules = public.orbit_clean(btrim(coalesce(p_rules, ''))),
        starts_at = p_starts, ends_at = p_ends, reg_closes_at = p_reg_closes, max_players = p_max,
        prize_text = public.orbit_clean(btrim(coalesce(p_prize_text, ''))), orbit_prizes = case when cur.prizes_paid then cur.orbit_prizes else coalesce(p_orbit_prizes, true) end,
        status = case when p_publish and cur.status = 'draft' then 'open' else cur.status end
      where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.tournament_save(uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, int, text, boolean, boolean) from public;
grant execute on function public.tournament_save(uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, int, text, boolean, boolean) to authenticated;

-- ───────── 2. automatic scores ─────────
-- Called by the games after every finished round. Returns how many tournaments the score was recorded in.
--   * the player must have entered (signed up) and the tournament must be live and between its start and end
--   * their FIRST score after entering is always recorded (even if it is not their personal best)
--   * after that, a score is only recorded when it beats the one already recorded
create or replace function public.tournament_record_score(p_game text, p_score bigint) returns int
language plpgsql security definer set search_path = public as $$
declare t record; best bigint; n int := 0;
begin
  if auth.uid() is null or not public.orbit_can_act() then return 0; end if;
  if p_game is null or p_score is null or p_score <= 0 or p_score > 1000000000 then return 0; end if;
  for t in
    select tr.id from tournaments tr
      join tournament_players tp on tp.tournament_id = tr.id and tp.user_id = auth.uid() and tp.status = 'registered'
     where tr.game = p_game and tr.format = 'leaderboard' and tr.status = 'live' and now() >= tr.starts_at and now() < tr.ends_at
  loop
    select max(s.score) into best from tournament_scores s
     where s.tournament_id = t.id and s.user_id = auth.uid() and s.status = 'approved';
    if best is null or p_score > best then
      insert into tournament_scores (tournament_id, user_id, score, note, status, reviewed_by)
        values (t.id, auth.uid(), p_score, case when best is null then 'First score after entering' else 'Recorded from the game' end, 'approved', auth.uid());
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.tournament_record_score(text, bigint) from public;
grant execute on function public.tournament_record_score(text, bigint) to authenticated;

-- typing a score in by hand: only while the tournament runs, and the first one is recorded straight away (the rest wait for review)
create or replace function public.tournament_submit_score(p_id uuid, p_score bigint, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare t tournaments; first_one boolean;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot submit a score right now.'; end if;
  select * into t from tournaments where id = p_id;
  if t.id is null or t.status <> 'live' or t.format <> 'leaderboard' then raise exception 'Scores are not being accepted for this tournament.'; end if;
  if now() >= t.ends_at then raise exception 'This tournament has ended. No more scores are accepted.'; end if;
  if not exists (select 1 from tournament_players where tournament_id = p_id and user_id = auth.uid() and status = 'registered') then raise exception 'You are not signed up for this tournament.'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then raise exception 'That score is not valid.'; end if;
  if (select count(*) from tournament_scores where tournament_id = p_id and user_id = auth.uid() and status = 'pending') >= 5 then raise exception 'You already have 5 scores waiting for review.'; end if;
  first_one := not exists (select 1 from tournament_scores where tournament_id = p_id and user_id = auth.uid() and status = 'approved');
  insert into tournament_scores (tournament_id, user_id, score, note, status, reviewed_by)
    values (p_id, auth.uid(), p_score, public.orbit_clean(left(btrim(coalesce(p_note, '')), 200)),
            case when first_one then 'approved' else 'pending' end, case when first_one then auth.uid() end);
end $$;

-- finishing: only scores made after the player entered count; the best one wins (earlier breaks a tie)
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
     where s.tournament_id = p_id and s.status = 'approved' and s.created_at >= tp.registered_at
     order by s.user_id, s.score desc, s.created_at),
  ranked as (select user_id, row_number() over (order by score desc, created_at) place from best)
  update tournament_players tp set placement = ranked.place from ranked
   where tp.tournament_id = p_id and tp.user_id = ranked.user_id and ranked.place <= 3;
  update tournaments set status = 'completed' where id = p_id;
  perform public._t_pay(p_id);
end $$;
