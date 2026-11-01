-- Chatter: smarter swear-word filter (catches fu*k, f**k, f*ck, fuuuck, f u c k, f.u.c.k, $hit, b!tch, fvck ...).
-- Run once in Supabase Dashboard > SQL Editor, AFTER migration-profanity-filter.sql. Safe to re-run.
-- It replaces the two matching functions; the triggers from the first script keep working and pick this up automatically.
--   * A censor symbol (* # _ % & ? ^ ~) can stand in for any letter except the first:  f*ck, f**k, fu*k, sh*t, a**hole.
--   * Letters can be stretched (fuuuck), split by . _ - (f.u.c.k), spelled with single spaces (f u c k),
--     or swapped for lookalikes (@ 4 3 1 ! 0 $ 5 7 and v for u: $hit, b!tch, fvck).
--   * "Weak" words (ass, damn ...) only accept @ $ ! 0 1 lookalikes and must be a whole word, so class, assess,
--     bass, assistant, Hassan, cocktail and cumulative stay untouched.
--   * Masked text becomes # (one per character), e.g. "fu*k" -> "####".
--   * First names are checked with the same matcher, so "Fu*k" or "Sh!t" are refused too.

insert into public.banned_words (word, strong) values
  ('fck', true), ('fuk', true), ('sht', false), ('btch', false)
on conflict (word) do nothing;

-- Escapes regex special characters so matched text can be searched for literally.
create or replace function public.regex_escape(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(t, '([]\\^$.|?*+(){}[-])', '\\\1', 'g') $$;
revoke execute on function public.regex_escape(text) from public, anon, authenticated;

-- Turns one word into a regex that also matches its disguised spellings.
create or replace function public.profanity_pattern(w text, p_strong boolean) returns text
language plpgsql immutable set search_path = public as $$
declare i int; ch text; cls text; pat text := ''; sp text := ''; wild text := '[*#_%&?^~]';
begin
  for i in 1 .. char_length(w) loop
    ch := substr(w, i, 1);
    cls := case ch
      when 'a' then case when p_strong then '[a@4]'   else '[a@]'  end
      when 'b' then case when p_strong then '[b8]'    else 'b'     end
      when 'e' then case when p_strong then '[e3]'    else 'e'     end
      when 'g' then case when p_strong then '[g9]'    else 'g'     end
      when 'i' then case when p_strong then '[i1!|]'  else '[i1!]' end
      when 'l' then case when p_strong then '[l1|]'   else 'l'     end
      when 'o' then '[o0]'
      when 's' then case when p_strong then '[s$5]'   else '[s$]'  end
      when 't' then case when p_strong then '[t7+]'   else 't'     end
      when 'u' then '[uv]'
      else ch end;
    if p_strong then
      pat := pat || case when i > 1 then '[._-]?' else '' end
                 || '(?:' || cls || '+' || case when i > 1 then '|' || wild || '+' else '' end || ')';
      sp  := sp  || case when i > 1 then '[ ._-]' else '' end || cls;
    else
      pat := pat || cls;
    end if;
  end loop;
  if p_strong and char_length(w) >= 3 then return '(?:' || pat || '|' || sp || ')'; end if;
  return pat;
end $$;
revoke execute on function public.profanity_pattern(text, boolean) from public, anon, authenticated;

-- Replace every swear word (and disguised version) with #. GIF tokens like :gif:name: are left alone.
create or replace function public.mask_profanity(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare s text; w text; out text := t; m text; sre text; wre text;
begin
  if t is null or t = '' or t ~ '^:u?gif:' then return t; end if;
  select string_agg(public.profanity_pattern(word, true),  '|' order by length(word) desc) into s from banned_words where strong;
  select string_agg(public.profanity_pattern(word, false), '|' order by length(word) desc) into w from banned_words where not strong;
  if s is not null then
    sre := '(?<![a-z0-9])((?:' || s || ')[a-z]*)';
    for m in select q.m from (select distinct (regexp_matches(out, sre, 'gi'))[1] as m) q order by length(q.m) desc loop
      out := regexp_replace(out, '(?<![a-z0-9])' || public.regex_escape(m), repeat('#', length(m)), 'gi');
    end loop;
  end if;
  if w is not null then
    wre := '(?<![a-z0-9])((?:' || w || ')(?:s|es|ed|ing|er)?)(?![a-z0-9])';
    for m in select q.m from (select distinct (regexp_matches(out, wre, 'gi'))[1] as m) q order by length(q.m) desc loop
      out := regexp_replace(out, '(?<![a-z0-9])' || public.regex_escape(m) || '(?![a-z0-9])', repeat('#', length(m)), 'gi');
    end loop;
  end if;
  return out;
end $$;
revoke execute on function public.mask_profanity(text) from public, anon, authenticated;

-- True if a name contains a blocked word, including disguised ones.
create or replace function public.name_is_blocked(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n text := translate(lower(coalesce(t, '')), '0134578@$!', 'oieastbasi'); letters text; toks text; s text;
begin
  letters := regexp_replace(n, '[^a-z]', '', 'g');
  toks    := btrim(regexp_replace(n, '[^a-z]+', ' ', 'g'));
  if exists (select 1 from banned_words b
             where (b.strong and position(b.word in letters) > 0)
                or (not b.strong and toks ~ ('\m' || b.word || '(?:s|es|ed|ing|er)?\M'))) then
    return true;
  end if;
  select string_agg(public.profanity_pattern(word, true), '|') into s from banned_words where strong;
  if s is not null and coalesce(t, '') ~* ('(?:' || s || ')') then return true; end if;
  return public.mask_profanity(t) is distinct from t;
end $$;
revoke execute on function public.name_is_blocked(text) from public, anon, authenticated;

-- Quick self-test (shows the result in the SQL Editor; every swear should be ####, normal words untouched):
select public.mask_profanity('fu*k f**k f*ck fuuuck f u c k f.u.c.k $hit b!tch a$$ fvck sh*t a**hole')           as should_be_all_hashes,
       public.mask_profanity('class assess bass assistant Hassan cocktail cumulative who read this ship it')    as should_be_unchanged;
