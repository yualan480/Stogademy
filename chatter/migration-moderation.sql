-- ═══════════════════════════════════════════════════════════════════════════
-- Chatter: content moderation system
-- Run this ONCE in the Supabase SQL Editor (it is safe to re-run). Do NOT run the older
-- migration-profanity-filter.sql / migration-profanity-filter-2.sql: this replaces them.
--
-- What it adds
--   * a disguise-resistant profanity / slur / sexual-language / threat detector with an owner-editable word list and allow list
--   * database triggers that reject bad text no matter how it arrives (the website, a script, or a direct API call)
--   * send_message / edit_message / change_first_name / choose_display_name: they explain a rejection and count the violation
--   * warnings that add up to a temporary timeout (never a permanent ban), reusing your existing timeout feature
--   * sign-up rules for inappropriate names (and a "choose a display name" step instead of locking anyone out)
--   * admin functions for the word list, allow list, settings, event review, false positives and timeouts
--
-- It also: lets timeouts apply to private messages, adds the permission "manage_moderation" for the owner to hand out,
-- and removes TRUNCATE/TRIGGER/REFERENCES from user_gifs (nothing in the app uses them).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: settings, word list, allow list, and the detector
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mod_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,                 -- master switch (turn off if the filter ever misbehaves)
  filter_dms boolean not null default true,              -- also filter private messages
  window_hours int not null default 24 check (window_hours between 1 and 720),
  timeout_after int not null default 3 check (timeout_after between 0 and 50),      -- warning points in the window that trigger a timeout (0 = never auto-timeout)
  timeout_minutes int not null default 5 check (timeout_minutes between 1 and 1440),
  timeout2_after int not null default 6 check (timeout2_after between 0 and 100),   -- points that trigger the longer timeout
  timeout2_minutes int not null default 30 check (timeout2_minutes between 1 and 1440),
  updated_at timestamptz not null default now()
);
insert into mod_settings (id) values (1) on conflict do nothing;

create table if not exists mod_terms (
  id uuid primary key default gen_random_uuid(),
  term text not null check (term ~ '^[a-z]+( [a-z]+){0,5}$' and char_length(term) between 2 and 60),
  category text not null check (category in ('profanity','sexual','slur','hate','threat','harassment','impersonation')),
  match text not null default 'word' check (match in ('word','prefix','contains')),   -- word = whole word, prefix = starts a word, contains = anywhere in a word
  applies text not null default 'all' check (applies in ('all','chat','name')),
  weight int not null default 1 check (weight between 0 and 5),                        -- warning points (0 = block only, no strike)
  enabled boolean not null default true,
  built_in boolean not null default false,
  note text not null default '' check (char_length(note) <= 200),
  pattern text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (term, applies)
);

create table if not exists mod_allow (                    -- innocent words/phrases that must never be flagged (false-positive fixes)
  word text primary key check (word ~ '^[a-z]+( [a-z]+){0,4}$' and char_length(word) between 2 and 60),
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Lower-cases and strips tricks: fullwidth/styled letters, accents, invisible characters, look-alike Cyrillic/Greek letters, apostrophes.
create or replace function mod_norm(t text) returns text language plpgsql immutable as $$
declare s text := coalesce(t, '');
begin
  s := lower(normalize(s, NFKC));
  s := regexp_replace(s, '[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff\u00ad\u180e\u034f]', '', 'g');
  s := regexp_replace(normalize(s, NFD), '[\u0300-\u036f]', '', 'g');
  s := translate(s, U&'\0430\0432\0435\043a\043c\043d\043e\0440\0441\0442\0443\0445\0456\0458\0455\0501\04cf\04bb\051b\051d\03b1\03b2\03b5\03b9\03ba\03bd\03bf\03c1\03c4\03c5\03c7\03b7\0131\0261', 'abekmhopctyxijsdlhqwabeikvoptuxnig');
  s := replace(replace(replace(replace(s, '''', ''), U&'\2019', ''), '`', ''), U&'\00df', 'ss');
  s := translate(s, U&'\00f8\0111\0142', 'odl');
  return s;
end $$;

-- "f u c k", "f.u.c.k", "s-h-i-t": 3 or more single characters in a row are joined into one word.
create or replace function mod_collapse(t text) returns text language plpgsql immutable as $$
declare r text := t; m text; toks text[]; n int; alt text;
begin
  for m in select (regexp_matches(t, '(?<![a-z0-9@$!|+*])[a-z0-9@$!|+*](?:[ ._,/:;~-]+[a-z0-9@$!|+*]){2,}(?![a-z0-9@$!|+*])', 'g'))[1] loop
    toks := regexp_split_to_array(m, '[ ._,/:;~-]+');
    n := array_length(toks, 1);
    alt := '';
    -- "a s h i t": also try the run without a leading/trailing one-letter word (a, i), which would otherwise glue onto the word
    if n >= 4 and toks[1] in ('a', 'i') then alt := alt || ' ' || array_to_string(toks[2:n], ''); end if;
    if n >= 4 and toks[n] in ('a', 'i') then alt := alt || ' ' || array_to_string(toks[1:n-1], ''); end if;
    r := replace(r, m, array_to_string(toks, '') || alt);
  end loop;
  return r;
end $$;

-- Builds the regular expression for one word or phrase: look-alike digits/symbols (sh1t, a$$, n!gga), repeated letters (fuuuck),
-- censor stars (f*ck, f**k), dots/dashes between letters (f.u.c.k), and whole-word / word-start / anywhere matching.
create or replace function mod_pattern(p_term text, p_match text) returns text language plpgsql immutable as $$
declare
  w text; i int; n int; ch text; cnt int; cls text; grp text; wp text; pat text := ''; core text; first_g boolean;
  letters int := char_length(replace(p_term, ' ', ''));
  wild text := case when letters <= 3 then '[*]' else '[*#%&^~._-]' end;
  sep text := case when letters <= 3 then '' else '[._-]?' end;
  multi boolean := position(' ' in p_term) > 0;
begin
  foreach w in array string_to_array(p_term, ' ') loop
    wp := ''; i := 1; n := char_length(w); first_g := true;
    while i <= n loop
      ch := substr(w, i, 1); cnt := 1;
      while i + cnt <= n and substr(w, i + cnt, 1) = ch loop cnt := cnt + 1; end loop;
      cls := case ch
        when 'a' then '[a@4]' when 'b' then '[b8]' when 'e' then '[e3]' when 'g' then '[gq9]'
        when 'i' then '[i1!|]' when 'k' then '[kq]' when 'l' then '[l1|]' when 'o' then '[o0]'
        when 's' then '[s$5]' when 't' then '[t7+]' when 'u' then '[uv]' else '[' || ch || ']' end;
      if first_g then
        grp := cls || case when cnt > 1 then '{' || cnt || ',}' else '+' end;
      else
        grp := '(?:' || cls || '|' || wild || ')' || case when cnt > 1 then '{' || cnt || ',}' else '+' end;
      end if;
      wp := wp || case when first_g then '' else sep end || grp;
      first_g := false; i := i + cnt;
    end loop;
    pat := pat || case when pat = '' then '' else '[ ._-]*' end || wp;
  end loop;
  core := '(?:' || pat || ')';
  return case p_match
    when 'prefix' then '(?<![a-z0-9])(' || core || '[a-z0-9]*)'
    when 'contains' then '([a-z0-9]*' || core || '[a-z0-9]*)'
    else '(?<![a-z0-9])(' || core || case when multi then '' else '(?:s|es|ed|ing)?' end || ')(?![a-z0-9])' end;
end $$;

create or replace function mod_terms_set_pattern() returns trigger language plpgsql as $$
begin
  new.term := lower(btrim(new.term));
  new.pattern := mod_pattern(new.term, new.match);
  return new;
end $$;
drop trigger if exists mod_terms_pattern_trg on mod_terms;
create trigger mod_terms_pattern_trg before insert or update of term, match on mod_terms
  for each row execute function mod_terms_set_pattern();

-- Returns null when the text is fine, otherwise the worst match: {category, term, weight, matched}.
-- p_scope: 'chat' (messages, bios, polls...) or 'name' (first names, usernames).
create or replace function mod_scan(p_text text, p_scope text default 'chat') returns jsonb language plpgsql stable as $$
declare s text; ar text; c record; r record; m text;
begin
  s := mod_collapse(mod_norm(left(coalesce(p_text, ''), 8000)));
  if btrim(s) = '' then return null; end if;
  select string_agg(replace(word, ' ', '[ ._-]+'), '|' order by word) into ar from mod_allow;
  if ar is not null then s := regexp_replace(s, '(?<![a-z0-9])(?:' || ar || ')(?![a-z0-9])', ' ', 'g'); end if;
  -- Terms are ordered worst-first and tested 32 at a time with one combined regex per chunk (these stay in Postgres's regex cache,
  -- so clean messages are cheap). Only inside the first matching chunk do we look for the exact term.
  for c in
    select q.ch, string_agg('(?:' || q.pattern || ')', '|' order by q.rn) as pat
    from (select pattern, row_number() over (order by weight desc, char_length(term) desc, term) as rn,
                 (row_number() over (order by weight desc, char_length(term) desc, term) - 1) / 32 as ch
          from mod_terms where enabled and (applies = 'all' or applies = p_scope)) q
    group by q.ch order by q.ch
  loop
    if s ~ c.pat then
      for r in select t.term, t.category, t.weight, t.pattern from (
                 select term, category, weight, pattern, row_number() over (order by weight desc, char_length(term) desc, term) as rn
                 from mod_terms where enabled and (applies = 'all' or applies = p_scope)) t
               where (t.rn - 1) / 32 = c.ch order by t.rn
      loop
        m := substring(s from r.pattern);
        if m is not null then
          return jsonb_build_object('category', r.category, 'term', r.term, 'weight', r.weight, 'matched', m);
        end if;
      end loop;
    end if;
  end loop;
  return null;
end $$;

-- ─────────── built-in word list (the owner can edit all of this in Admin dashboard → Moderation) ───────────
insert into mod_terms (term, category, match, applies, weight, built_in)
select unnest(terms), category, match, applies, weight, true from (values
  ('profanity','contains','all',1, array['fuck']),
  ('profanity','prefix','all',1, array['shit','bullshit','dipshit','horseshit','apeshit','batshit','bitch','biatch','asshole','dumbass','jackass','smartass','fatass','asshat','asswipe','phuck','wanker','douchebag','jerkoff','jackoff','goddamn']),
  ('profanity','word','all',1, array['ass','arse','damn','dammit','damnit','crap','crappy','piss','dick','dickhead','cock','bastard','twat','bollocks','douche','btch']),
  ('profanity','word','chat',1, array['fuk','fck','fuq','wtf','stfu','gtfo','omfg']),
  ('profanity','prefix','all',2, array['cunt']),
  ('sexual','prefix','all',2, array['porn','blowjob','handjob','rimjob','dildo','cumshot','jizz','masturbat','pedophile','paedophile','hentai','onlyfans']),
  ('sexual','word','all',2, array['cum','orgasm','horny','boner','nudes','tits','titties','boobs','milf','anal','rape','raped','raping','rapist','pedo','incest','pussy','sexting','blow job','hand job','jerk off']),
  ('harassment','prefix','all',2, array['whore','slut']),
  ('harassment','word','all',2, array['thot','skank']),
  ('slur','contains','all',3, array['nigger','nigga','niqqa','niqqer','faggot']),
  ('slur','prefix','all',3, array['nigg','fagg','wetback','towelhead','raghead','shemale','jigaboo','zipperhead']),
  ('slur','word','all',3, array['fag','kike','gook','spic','beaner','chink','paki','tranny','trannies','retard','dyke','darkie']),
  ('slur','word','all',2, array['spaz','spazz']),
  ('hate','word','chat',3, array['heil hitler','sieg heil','white power','gas the jews','hitler was right']),
  ('threat','word','chat',3, array['kill yourself','kill urself','kys','hang yourself','hang urself','shoot yourself','end yourself','neck yourself','go die','go and die','drink bleach','i know where you live',
     'shoot up the school','shoot up this school','shoot up our school','shoot up my school','blow up the school','blow up this school','bomb the school','bomb this school',
     'bring a gun to school','bring a knife to school','kill everyone at school','kill everyone in school','kill everyone in this school']),
  ('impersonation','word','name',0, array['admin','administrator','moderator','mod','owner','staff','teacher','principal','vice principal','headmaster','counselor','counsellor','official','chatter','system','support','helpdesk','security','superintendent','mr','mrs','ms','mx','dr','prof','professor','coach'])
) as v(category, match, applies, weight, terms)
on conflict do nothing;

insert into mod_terms (term, category, match, applies, weight, built_in)
select s || ' ' || v || ' ' || o, 'threat', 'word', 'chat', 3, true
from unnest(array['i will','ill','i am going to','im going to','im gonna','i am gonna','gonna','going to']) s,
     unnest(array['kill','murder','shoot','stab','strangle']) v,
     unnest(array['you','u']) o
on conflict do nothing;

insert into mod_terms (term, category, match, applies, weight, built_in)
select 'kill all ' || g, 'hate', 'word', 'chat', 3, true
from unnest(array['jews','blacks','whites','gays','muslims','christians','asians','mexicans','immigrants']) g
on conflict do nothing;

insert into mod_allow (word, note)
select unnest(array['shiitake','shiitakes','shitake','shitakes','snigger','sniggers','sniggered','sniggering','niggle','niggles','niggled','niggling','niggly','scunthorpe',
  'moby dick','cum laude','magna cum laude','summa cum laude','pussy willow','pussy willows',
  'shoot you a','shoot u a','shoot you an','shoot u an']), 'built-in: innocent word or phrase that looks like a banned one'
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: enforcement (triggers, RPCs, admin functions, sign-up rules, permissions)
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 The moderation tables are not reachable from the app at all: no policies, no grants. Only the functions below touch them.
create table if not exists mod_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references profiles(id) on delete cascade,
  surface text not null,                       -- channel, dm, edit, dm_edit, name, bio, status, poll, suggestion, gif, reaction, attachment
  category text not null,
  term text not null,
  matched text not null default '',
  excerpt text not null default '',            -- the blocked text (never stored for private messages)
  points int not null default 0,
  action text not null default 'blocked' check (action in ('blocked','timeout')),
  timeout_seconds int,
  status text not null default 'open' check (status in ('open','dismissed','confirmed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);
create index if not exists mod_events_user_idx on mod_events (user_id, created_at desc);
create index if not exists mod_events_status_idx on mod_events (status, created_at desc);

alter table mod_settings enable row level security;
alter table mod_terms enable row level security;
alter table mod_allow enable row level security;
alter table mod_events enable row level security;
revoke all on mod_settings, mod_terms, mod_allow, mod_events from anon, authenticated;

-- 2.2 profiles: people whose name had to be neutralised are asked to choose a new one (they are never locked out)
alter table profiles add column if not exists name_status text not null default 'ok';
do $$ begin
  alter table profiles add constraint profiles_name_status_check check (name_status in ('ok','rename_required'));
exception when duplicate_object then null; end $$;

create or replace function profile_name_sync() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.name_reset', true), '') <> '1' then new.last_name := old.last_name; end if;
  new.first_name := btrim(new.first_name);
  new.display_name := btrim(new.first_name || ' ' || new.last_name);
  return new;
end $$;

-- 2.3 a new permission the owner can hand to admins/moderators (reviewing events uses the existing view_reports / resolve_reports, timeouts use "timeout")
alter table role_permissions drop constraint if exists role_permissions_permission_check;
alter table role_permissions add constraint role_permissions_permission_check check (permission = any (array[
  'delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit','manage_moderation']));
insert into role_permissions (role, permission, granted)
select r, 'manage_moderation', false from unnest(array['admin','moderator']) r
where not exists (select 1 from role_permissions where role = r and permission = 'manage_moderation');

create or replace function my_permissions() returns text[] language plpgsql stable security definer set search_path = public as $$
declare r text := server_role(main_server());
begin
  if r = 'owner' then
    return array['delete_messages','timeout','kick','ban','pin_messages','lock_channels','slow_mode','manage_channels','view_users','view_reports','resolve_reports','view_audit',
                 'manage_moderation','manage_server','manage_roles','manage_names','manage_permissions'];
  end if;
  return coalesce((select array_agg(distinct x) from (
    select permission as x from role_permissions where r in ('admin','moderator') and role = r and granted
    union
    select cp.permission from class_role_members m join class_role_permissions cp on cp.role_id = m.role_id
      where m.user_id = auth.uid() and m.assigned_by is not null) s), '{}');
end $$;

-- 2.4 plain-language explanations
create or replace function mod_mask(p_term text) returns text language sql immutable as $$
  select case when char_length(l) < 2 then '' else substr(l, 1, 1) || repeat('*', least(char_length(l) - 1, 8)) end
  from (select regexp_replace(coalesce(p_term, ''), '[^a-z]', '', 'g') as l) x $$;

create or replace function mod_notice(p_res jsonb, p_what text) returns text language plpgsql immutable as $$
declare cat text := p_res->>'category'; mk text := mod_mask(p_res->>'term'); lab text; subj text; tail text := '';
begin
  if cat = 'impersonation' then
    return 'That name can''t be used because it could be mistaken for a staff or official account ("' || (p_res->>'term') || '"). Please choose a different one.';
  end if;
  lab := case cat when 'profanity' then 'profanity' when 'sexual' then 'sexual language' when 'slur' then 'a slur' when 'hate' then 'hateful language'
                  when 'threat' then 'a threat or encouragement of harm' when 'harassment' then 'harassment' else 'language that isn''t allowed here' end;
  subj := case p_what when 'message' then 'Your message wasn''t sent' when 'edit' then 'Your edit wasn''t saved' when 'name' then 'That name can''t be used'
                  when 'bio' then 'Your bio wasn''t saved' when 'status' then 'Your status wasn''t saved' when 'poll' then 'Your poll wasn''t posted'
                  when 'suggestion' then 'Your suggestion wasn''t sent' when 'gif' then 'That GIF name isn''t allowed' when 'reaction' then 'That reaction isn''t allowed'
                  when 'attachment' then 'That file name isn''t allowed' else 'That wasn''t saved' end;
  if p_what in ('message','edit') then tail := ' Please reword it.'; elsif p_what = 'name' then tail := ' Please choose a different name.'; end if;
  return subj || ': it contains ' || lab || case when cat in ('profanity','sexual','harassment') and mk <> '' then ' ("' || mk || '")' else '' end || '.' || tail;
end $$;

-- 2.5 timeouts also stop private messages (channel messages were already covered)
create or replace function mod_assert_not_timed_out(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
declare tu timestamptz;
begin
  select timeout_until into tu from server_members where server_id = main_server() and user_id = p_user;
  if tu is not null and tu > now() then
    raise exception 'You are timed out until %.', to_char(tu at time zone 'utc', 'Mon DD HH24:MI "UTC"');
  end if;
end $$;

-- 2.6 the one place that records a violation, adds up warning points and applies a temporary timeout. Returns null when the text is fine.
create or replace function mod_enforce(p_user uuid, p_surface text, p_text text, p_scope text default 'chat') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st mod_settings%rowtype; r jsonb; pts int; total int; secs int := 0; until_ts timestamptz; ev uuid; what text; extra text := ''; is_owner_user boolean;
begin
  select * into st from mod_settings where id = 1;
  if not found or not st.enabled then return null; end if;
  r := mod_scan(p_text, p_scope);
  if r is null then return null; end if;
  pts := (r->>'weight')::int;
  what := case p_surface when 'channel' then 'message' when 'dm' then 'message' when 'edit' then 'edit' when 'dm_edit' then 'edit' else p_surface end;
  insert into mod_events (user_id, surface, category, term, matched, excerpt, points, status)
  values (p_user, p_surface, r->>'category', r->>'term', left(coalesce(r->>'matched', ''), 80),
          case when p_surface in ('dm','dm_edit') then '' else left(coalesce(p_text, ''), 300) end, pts, case when pts = 0 then 'confirmed' else 'open' end)
  returning id into ev;
  select coalesce(sum(points), 0) into total from mod_events
   where user_id = p_user and status <> 'dismissed' and created_at > now() - make_interval(hours => st.window_hours);
  select exists (select 1 from server_members where user_id = p_user and role = 'owner') into is_owner_user;
  if pts > 0 and not is_owner_user then
    if st.timeout2_after > 0 and total >= st.timeout2_after then secs := st.timeout2_minutes * 60;
    elsif st.timeout_after > 0 and total >= st.timeout_after then secs := st.timeout_minutes * 60;
    end if;
  end if;
  if secs > 0 then
    update server_members set timeout_until = greatest(coalesce(timeout_until, now()), now() + make_interval(secs => secs))
     where server_id = main_server() and user_id = p_user and role <> 'owner' returning timeout_until into until_ts;
    if found then
      update mod_events set action = 'timeout', timeout_seconds = secs where id = ev;
      insert into audit_log (actor_id, action, target_user, details)
      values (null, 'moderation.timeout', p_user, jsonb_build_object('minutes', secs / 60, 'points', total, 'event', ev, 'surface', p_surface));
    end if;
  end if;
  if is_owner_user then
    extra := ' (Owner accounts are never timed out automatically.)';
  elsif until_ts is not null then
    extra := ' You''ve been timed out for ' || (secs / 60) || ' minute' || case when secs / 60 = 1 then '' else 's' end
          || ' because of repeated violations. You can still read chat. If this is a mistake, tell a moderator.';
  elsif pts > 0 and st.timeout_after > 0 then
    extra := ' Warning ' || total || ' of ' || st.timeout_after || ': at ' || st.timeout_after || ' you''ll be timed out for ' || st.timeout_minutes
          || ' minute' || case when st.timeout_minutes = 1 then '' else 's' end || '.';
  elsif pts > 0 then
    extra := ' Repeated violations can lead to a timeout.';
  end if;
  return jsonb_build_object('blocked', true, 'code', 'moderation', 'category', r->>'category', 'surface', p_surface,
    'message', mod_notice(r, what) || extra, 'points', pts, 'warnings', total, 'timeout_until', until_ts, 'timeout_minutes', secs / 60);
end $$;

-- 2.7 BACKSTOP TRIGGERS: whatever the path (the app, a script, a direct API call), bad text never reaches the table.
create or replace function mod_trg_messages() returns trigger language plpgsql security definer set search_path = public as $$
declare st mod_settings%rowtype; r jsonb; what text := 'message'; names text;
begin
  if new.is_system then return new; end if;
  if tg_op = 'UPDATE' then
    if new.content is not distinct from old.content then return new; end if;
    what := 'edit';
  elsif new.conversation_id is not null then
    perform mod_assert_not_timed_out(new.author_id);
  end if;
  select * into st from mod_settings where id = 1;
  if not found or not st.enabled then return new; end if;
  if new.conversation_id is not null and not st.filter_dms then return new; end if;
  r := mod_scan(new.content, 'chat');
  if r is null and tg_op = 'INSERT' and jsonb_typeof(new.attachments) = 'array' and jsonb_array_length(new.attachments) > 0 then
    select string_agg(coalesce(a.value->>'name', ''), ' . ') into names from jsonb_array_elements(new.attachments) a;
    r := mod_scan(names, 'chat');
    if r is not null then what := 'attachment'; end if;
  end if;
  if r is not null then raise exception '%', mod_notice(r, what); end if;
  return new;
end $$;
drop trigger if exists mod_guard_messages on messages;
create trigger mod_guard_messages before insert or update of content on messages for each row execute function mod_trg_messages();

create or replace function mod_trg_profiles() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; what text := 'name';
begin
  if not coalesce((select enabled from mod_settings where id = 1), false) then return new; end if;
  if new.first_name is distinct from old.first_name then r := mod_scan(new.first_name, 'name'); end if;
  if r is null and new.username is distinct from old.username then r := mod_scan(replace(new.username, '_', ' '), 'name'); end if;
  if r is null and new.last_name is distinct from old.last_name then r := mod_scan(new.last_name, 'name'); end if;
  if r is null and new.bio is distinct from old.bio then r := mod_scan(new.bio, 'chat'); what := 'bio'; end if;
  if r is null and new.custom_status is distinct from old.custom_status then r := mod_scan(new.custom_status, 'chat'); what := 'status'; end if;
  if r is not null then raise exception '%', mod_notice(r, what); end if;
  return new;
end $$;
drop trigger if exists mod_guard_profiles on profiles;
create trigger mod_guard_profiles before update of first_name, username, last_name, bio, custom_status on profiles for each row execute function mod_trg_profiles();

create or replace function mod_trg_simple() returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb; i int; txt text;
begin
  if not coalesce((select enabled from mod_settings where id = 1), false) then return new; end if;
  for i in 1 .. tg_nargs - 1 loop
    txt := to_jsonb(new) ->> tg_argv[i];
    if tg_op = 'UPDATE' and txt is not distinct from (to_jsonb(old) ->> tg_argv[i]) then continue; end if;
    r := mod_scan(txt, 'chat');
    if r is not null then raise exception '%', mod_notice(r, tg_argv[0]); end if;
  end loop;
  return new;
end $$;
drop trigger if exists mod_guard_poll_options on poll_options;
create trigger mod_guard_poll_options before insert or update of label on poll_options for each row execute function mod_trg_simple('poll', 'label');
drop trigger if exists mod_guard_suggestions on suggestions;
create trigger mod_guard_suggestions before insert or update of title, body on suggestions for each row execute function mod_trg_simple('suggestion', 'title', 'body');
drop trigger if exists mod_guard_user_gifs on user_gifs;
create trigger mod_guard_user_gifs before insert or update of name on user_gifs for each row execute function mod_trg_simple('gif', 'name');
drop trigger if exists mod_guard_reactions on message_reactions;
create trigger mod_guard_reactions before insert or update of emoji on message_reactions for each row execute function mod_trg_simple('reaction', 'emoji');

-- 2.8 what the app calls (these explain the rejection and count the violation, then hand the clean text to the normal tables)
create or replace function send_message(p_channel uuid, p_conversation uuid, p_content text, p_attachments jsonb default '[]'::jsonb, p_reply_to uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v jsonb; names text; m messages%rowtype; dm boolean := p_conversation is not null;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if (p_channel is null) = (p_conversation is null) then raise exception 'Pick a channel or a conversation to send to.'; end if;
  p_content := coalesce(p_content, '');
  p_attachments := coalesce(p_attachments, '[]'::jsonb);
  if jsonb_typeof(p_attachments) <> 'array' then raise exception 'Attachments must be a list.'; end if;
  if dm and not is_conv_member(p_conversation) then raise exception 'You are not in that conversation.'; end if;
  perform mod_assert_not_timed_out(uid);
  if not dm and not can_post(p_channel) then raise exception 'You can''t post in this channel right now.'; end if;
  if not dm or coalesce((select filter_dms from mod_settings where id = 1), true) then
    v := mod_enforce(uid, case when dm then 'dm' else 'channel' end, p_content);
    if v is null and jsonb_array_length(p_attachments) > 0 then
      select string_agg(coalesce(a.value->>'name', ''), ' . ') into names from jsonb_array_elements(p_attachments) a;
      v := mod_enforce(uid, 'attachment', names);
    end if;
    if v is not null then return v; end if;
  end if;
  insert into messages (author_id, channel_id, conversation_id, content, attachments, reply_to)
  values (uid, p_channel, p_conversation, p_content, p_attachments, p_reply_to) returning * into m;
  return to_jsonb(m);
end $$;

create or replace function edit_message(p_id uuid, p_content text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m messages%rowtype; v jsonb;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  select * into m from messages where id = p_id and author_id = uid and not is_system for update;
  if not found then raise exception 'Message not found.'; end if;
  if m.channel_id is not null and not can_post(m.channel_id) then raise exception 'You can''t edit messages in this channel right now.'; end if;
  p_content := coalesce(p_content, '');
  if char_length(p_content) = 0 and jsonb_array_length(m.attachments) = 0 then raise exception 'A message can''t be empty.'; end if;
  if m.conversation_id is null or coalesce((select filter_dms from mod_settings where id = 1), true) then
    v := mod_enforce(uid, case when m.conversation_id is not null then 'dm_edit' else 'edit' end, p_content);
    if v is not null then return v; end if;
  end if;
  update messages set content = p_content where id = p_id returning * into m;
  return to_jsonb(m);
end $$;

create or replace function change_first_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v jsonb; pr profiles%rowtype;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 1 or char_length(p_name) > 20 then raise exception 'A first name is 1 to 20 characters.'; end if;
  v := mod_enforce(uid, 'name', p_name, 'name');
  if v is not null then return v; end if;
  update profiles set first_name = p_name where id = uid returning * into pr;
  return jsonb_build_object('ok', true, 'profile', to_jsonb(pr));
end $$;

create or replace function choose_display_name(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v jsonb; pr profiles%rowtype;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if not exists (select 1 from profiles where id = uid and name_status = 'rename_required') then raise exception 'Your display name is already set.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 20 then raise exception 'A display name is 2 to 20 characters.'; end if;
  v := mod_enforce(uid, 'name', p_name, 'name');
  if v is not null then return v; end if;
  perform set_config('app.name_reset', '1', true);
  update profiles set first_name = p_name, last_name = '', name_status = 'ok' where id = uid returning * into pr;
  perform set_config('app.name_reset', '', true);
  return jsonb_build_object('ok', true, 'profile', to_jsonb(pr));
end $$;

-- 2.9 sign-up: names come from the school email, so the email is what gets checked
create or replace function mod_signup_check(p_email text, p_oauth boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email, ''))); lp text; m text[]; r jsonb; on_roster boolean; ex boolean;
begin
  if e !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' then
    return jsonb_build_object('problem', 'Only school email addresses (like 30yua@tesdk12.net) can sign up.');
  end if;
  ex := lock_exempt(e);
  on_roster := exists (select 1 from allowed_emails where email = e);
  if not ex and exists (select 1 from allowed_emails) and not on_roster then
    return jsonb_build_object('problem', 'That email is not on the approved school list. Check for typos, or ask the owner to add it.');
  end if;
  if not coalesce((select enabled from mod_settings where id = 1), false) then return '{}'::jsonb; end if;
  lp := split_part(e, '@', 1);
  m := regexp_match(lp, '^([0-9]{2})([a-z]+)([a-z])([0-9]*)$');
  r := mod_scan(initcap(m[2]), 'name');
  if r is null then r := mod_scan(m[3], 'name'); end if;
  if r is null then r := mod_scan(regexp_replace(lp, '[0-9]', '', 'g'), 'name'); end if;
  if r is not null then
    if ex or on_roster or p_oauth then return jsonb_build_object('rename', true); end if;   -- trusted sign-in: never block, ask for a new display name
    return jsonb_build_object('problem', 'That email can''t be used to sign up because the name in it contains language that isn''t allowed here. If it is your real school email, ask the owner to add it to the approved list.');
  end if;
  return '{}'::jsonb;
end $$;

create or replace function signup_email_problem(p_email text) returns text language sql stable security definer set search_path = public as $$
  select (mod_signup_check(p_email, false))->>'problem' $$;
grant execute on function signup_email_problem(text) to anon, authenticated;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare e text := lower(coalesce(new.email, '')); lp text; m text[]; d uuid; ex boolean := public.lock_exempt(new.email);
        chk jsonb; ren boolean; uname text; fn text; ln text;
        oauth boolean := coalesce(new.raw_app_meta_data->>'provider', 'email') <> 'email';   -- Google/Microsoft sign-in
begin
  chk := public.mod_signup_check(e, oauth);
  if chk->>'problem' is not null then raise exception '%', chk->>'problem'; end if;
  ren := coalesce((chk->>'rename')::boolean, false);
  begin d := (new.raw_user_meta_data->>'device_id')::uuid; exception when others then d := null; end;
  -- Email sign-ups send a device id with the form. Google sign-ins cannot, so for them the account is created without one and
  -- claim_device() links the browser the first time the person opens Orbit (the one-account-per-device rule still applies there).
  if not ex and not (oauth and d is null) then
    if d is null then raise exception 'This device could not be identified. Reload the page and try again.'; end if;
    if exists (select 1 from device_bindings where device_id = d) then
      raise exception 'This device is already linked to a different account.';
    end if;
  end if;
  lp := split_part(e, '@', 1);
  m := regexp_match(lp, '^([0-9]{2})([a-z]+)([a-z])([0-9]*)$');
  if ren then
    uname := 'user' || substr(md5(new.id::text), 1, 8); fn := 'New'; ln := 'Student';      -- neutral placeholder until they pick a name
  else
    uname := lp; fn := upper(m[3]); ln := initcap(m[2]);
  end if;
  insert into profiles (id, username, display_name, first_name, last_name, name_status)
  values (new.id, uname, fn || ' ' || ln, fn, ln, case when ren then 'rename_required' else 'ok' end);
  insert into user_notification_settings (user_id) values (new.id);
  if not ex and d is not null then insert into device_bindings (device_id, user_id) values (d, new.id); end if;
  return new;
end $$;

-- 2.10 admin functions (every one checks permission first)
create or replace function mod_get_config() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from mod_settings s where id = 1),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'term', term, 'category', category, 'match', match, 'applies', applies,
                'weight', weight, 'enabled', enabled, 'built_in', built_in, 'note', note) order by category, term) from mod_terms), '[]'::jsonb),
    'allow', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'note', note) order by word) from mod_allow), '[]'::jsonb));
end $$;

create or replace function mod_set_settings(p_enabled boolean, p_filter_dms boolean, p_window_hours int, p_timeout_after int, p_timeout_minutes int, p_timeout2_after int, p_timeout2_minutes int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  begin
    update mod_settings set enabled = coalesce(p_enabled, enabled), filter_dms = coalesce(p_filter_dms, filter_dms),
      window_hours = coalesce(p_window_hours, window_hours), timeout_after = coalesce(p_timeout_after, timeout_after),
      timeout_minutes = coalesce(p_timeout_minutes, timeout_minutes), timeout2_after = coalesce(p_timeout2_after, timeout2_after),
      timeout2_minutes = coalesce(p_timeout2_minutes, timeout2_minutes), updated_at = now() where id = 1;
  exception when check_violation then raise exception 'One of those numbers is outside the allowed range.';
  end;
  perform log_action('moderation.settings', null, jsonb_build_object('enabled', p_enabled, 'filter_dms', p_filter_dms));
end $$;

create or replace function mod_save_term(p_id uuid, p_term text, p_category text, p_match text, p_applies text, p_weight int, p_enabled boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t text := lower(regexp_replace(btrim(coalesce(p_term, '')), '\s+', ' ', 'g')); row mod_terms%rowtype; n int := char_length(replace(t, ' ', ''));
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  if t !~ '^[a-z]+( [a-z]+){0,5}$' then raise exception 'Use letters only (a phrase can have spaces). Disguises like numbers and symbols are caught automatically.'; end if;
  if p_match = 'contains' and n < 4 then raise exception '"Anywhere in a word" needs at least 4 letters, or it would flag innocent words.'; end if;
  if p_match = 'prefix' and n < 3 then raise exception '"Start of a word" needs at least 3 letters, or it would flag innocent words.'; end if;
  begin
    if p_id is null then
      insert into mod_terms (term, category, match, applies, weight, enabled, note, created_by)
      values (t, p_category, p_match, p_applies, p_weight, coalesce(p_enabled, true), left(coalesce(p_note, ''), 200), auth.uid()) returning * into row;
    else
      select * into row from mod_terms where id = p_id for update;
      if not found then raise exception 'That word no longer exists.'; end if;
      if row.built_in and row.term <> t then raise exception 'Built-in words can''t be renamed. Turn this one off and add a new word instead.'; end if;
      update mod_terms set term = t, category = p_category, match = p_match, applies = p_applies, weight = p_weight,
        enabled = coalesce(p_enabled, enabled), note = left(coalesce(p_note, ''), 200) where id = p_id returning * into row;
    end if;
  exception
    when unique_violation then raise exception 'That word is already on the list.';
    when check_violation then raise exception 'Check the category, match type and points (0 to 5).';
  end;
  perform log_action('moderation.term', null, jsonb_build_object('term', t, 'enabled', row.enabled));
  return jsonb_build_object('id', row.id, 'term', row.term);
end $$;

create or replace function mod_delete_term(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare row mod_terms%rowtype;
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  select * into row from mod_terms where id = p_id;
  if not found then return; end if;
  if row.built_in then raise exception 'Built-in words can be turned off but not deleted.'; end if;
  delete from mod_terms where id = p_id;
  perform log_action('moderation.term', null, jsonb_build_object('term', row.term, 'deleted', true));
end $$;

create or replace function mod_add_allow(p_word text, p_note text default '') returns void language plpgsql security definer set search_path = public as $$
declare w text := lower(regexp_replace(btrim(coalesce(p_word, '')), '\s+', ' ', 'g'));
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  if w !~ '^[a-z]+( [a-z]+){0,4}$' or char_length(w) < 2 then raise exception 'Use letters only (a phrase can have spaces).'; end if;
  insert into mod_allow (word, note, created_by) values (w, left(coalesce(p_note, ''), 200), auth.uid()) on conflict do nothing;
  perform log_action('moderation.allow', null, jsonb_build_object('word', w));
end $$;

create or replace function mod_remove_allow(p_word text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  delete from mod_allow where word = lower(btrim(coalesce(p_word, '')));
  perform log_action('moderation.allow', null, jsonb_build_object('word', p_word, 'removed', true));
end $$;

create or replace function mod_test(p_text text, p_scope text default 'chat') returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm('view_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  return jsonb_build_object('result', mod_scan(p_text, case when p_scope = 'name' then 'name' else 'chat' end),
                            'normalized', left(mod_collapse(mod_norm(p_text)), 300));
end $$;

create or replace function mod_list_events(p_status text default 'open', p_limit int default 60, p_before timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st mod_settings%rowtype;
begin
  if not (has_perm('view_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  if p_status not in ('open','dismissed','confirmed','all') then raise exception 'Unknown filter.'; end if;
  select * into st from mod_settings where id = 1;
  return jsonb_build_object(
    'window_hours', st.window_hours, 'timeout_after', st.timeout_after, 'enabled', st.enabled,
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select e.id, e.created_at, e.user_id, p.display_name, p.username, e.surface, e.category, e.term, e.matched, e.excerpt, e.points, e.action,
             e.timeout_seconds, e.status, e.reviewed_at,
             (select coalesce(sum(y.points), 0) from mod_events y where y.user_id = e.user_id and y.status <> 'dismissed'
                and y.created_at > now() - make_interval(hours => st.window_hours)) as strikes,
             (select sm.timeout_until from server_members sm where sm.server_id = main_server() and sm.user_id = e.user_id and sm.timeout_until > now()) as timed_out_until
      from mod_events e join profiles p on p.id = e.user_id
      where (p_status = 'all' or e.status = p_status) and (p_before is null or e.created_at < p_before)
      order by e.created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) x), '[]'::jsonb));
end $$;

create or replace function mod_review_event(p_id uuid, p_action text, p_allow boolean default false, p_lift boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev mod_events%rowtype; w text; added text;
begin
  if not (has_perm('resolve_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  if p_action not in ('dismiss','confirm') then raise exception 'Unknown action.'; end if;
  select * into ev from mod_events where id = p_id for update;
  if not found then raise exception 'That event no longer exists.'; end if;
  update mod_events set status = case p_action when 'dismiss' then 'dismissed' else 'confirmed' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if p_allow then
    if not has_perm('manage_moderation') then raise exception 'Only people who can configure moderation can add allowed words.'; end if;
    w := regexp_replace(lower(coalesce(ev.matched, '')), '[^a-z]', '', 'g');
    if position(' ' in ev.term) = 0 and char_length(w) between 2 and 40 then
      insert into mod_allow (word, note, created_by) values (w, 'added from a reviewed false positive', auth.uid()) on conflict do nothing;
      added := w;
    end if;
  end if;
  if p_lift then perform timeout_user(ev.user_id, 0, 'Moderation event reviewed as a false positive'); end if;
  perform log_action('moderation.review', ev.user_id, jsonb_build_object('event', p_id, 'action', p_action, 'allowed', added, 'lifted', coalesce(p_lift, false)));
  return jsonb_build_object('ok', true, 'allowed', added);
end $$;

create or replace function mod_list_timeouts() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_perm('timeout') or has_perm('view_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', sm.user_id, 'display_name', p.display_name, 'username', p.username, 'timeout_until', sm.timeout_until)
                   order by sm.timeout_until)
                   from server_members sm join profiles p on p.id = sm.user_id where sm.server_id = main_server() and sm.timeout_until > now()), '[]'::jsonb);
end $$;

-- Finds existing accounts whose current names fail the filter. p_apply = false only lists them; true asks them to pick a new name
-- (shown as "New Student" until they do; they keep full access).
create or replace function mod_rescan_names(p_apply boolean default false) returns jsonb language plpgsql security definer set search_path = public as $$
declare ids uuid[]; list jsonb;
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  select coalesce(array_agg(p.id), '{}'), coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'display_name', p.display_name)), '[]'::jsonb) into ids, list
  from profiles p
  where p.name_status = 'ok' and not exists (select 1 from server_members sm where sm.user_id = p.id and sm.role = 'owner')
    and (mod_scan(p.first_name, 'name') is not null or mod_scan(p.last_name, 'name') is not null or mod_scan(replace(p.username, '_', ' '), 'name') is not null);
  if p_apply and array_length(ids, 1) is not null then
    perform set_config('app.name_reset', '1', true);
    update profiles set first_name = 'New', last_name = 'Student', name_status = 'rename_required' where id = any(ids);
    perform set_config('app.name_reset', '', true);
    perform log_action('moderation.rescan', null, jsonb_build_object('flagged', array_length(ids, 1)));
  end if;
  return jsonb_build_object('count', coalesce(array_length(ids, 1), 0), 'users', list, 'applied', p_apply and array_length(ids, 1) is not null);
end $$;

-- 2.11 permissions: internal functions can't be called from the app; the app-facing ones need a signed-in user
alter function mod_norm(text) set search_path = public;
alter function mod_collapse(text) set search_path = public;
alter function mod_pattern(text, text) set search_path = public;
alter function mod_terms_set_pattern() set search_path = public;
alter function mod_scan(text, text) set search_path = public;
alter function mod_mask(text) set search_path = public;
alter function mod_notice(jsonb, text) set search_path = public;

revoke execute on function mod_norm(text), mod_collapse(text), mod_pattern(text, text), mod_terms_set_pattern(), mod_scan(text, text), mod_mask(text), mod_notice(jsonb, text),
  mod_enforce(uuid, text, text, text), mod_assert_not_timed_out(uuid), mod_trg_messages(), mod_trg_profiles(), mod_trg_simple(), mod_signup_check(text, boolean)
  from public, anon, authenticated;
revoke execute on function send_message(uuid, uuid, text, jsonb, uuid), edit_message(uuid, text), change_first_name(text), choose_display_name(text),
  mod_get_config(), mod_set_settings(boolean, boolean, int, int, int, int, int), mod_save_term(uuid, text, text, text, text, int, boolean, text), mod_delete_term(uuid),
  mod_add_allow(text, text), mod_remove_allow(text), mod_test(text, text), mod_list_events(text, int, timestamptz), mod_review_event(uuid, text, boolean, boolean),
  mod_list_timeouts(), mod_rescan_names(boolean) from public, anon;
grant execute on function send_message(uuid, uuid, text, jsonb, uuid), edit_message(uuid, text), change_first_name(text), choose_display_name(text),
  mod_get_config(), mod_set_settings(boolean, boolean, int, int, int, int, int), mod_save_term(uuid, text, text, text, text, int, boolean, text), mod_delete_term(uuid),
  mod_add_allow(text, text), mod_remove_allow(text), mod_test(text, text), mod_list_events(text, int, timestamptz), mod_review_event(uuid, text, boolean, boolean),
  mod_list_timeouts(), mod_rescan_names(boolean) to authenticated;

-- Hardening found during the review: nothing in the app needs TRUNCATE / TRIGGER / REFERENCES on user_gifs.
revoke truncate, trigger, references on public.user_gifs from authenticated, anon;
