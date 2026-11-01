-- Chatter: swear-word filter + blocked first names.
-- Run once in Supabase Dashboard > SQL Editor, AFTER the other migrations. Safe to re-run.
--   * Swear words in messages (channels and DMs, sends and edits), bios, custom statuses, poll options,
--     suggestions and uploaded-GIF names are replaced with # (one # per letter, e.g. "####").
--   * A first name containing a blocked word is refused ("That name isn't allowed...").
--     Leetspeak and separators are caught in names too (f.u.c.k, sh1t, etc.).
--   * The word list lives in public.banned_words. To add or remove words, edit that table in the Table Editor
--     or run SQL (examples at the bottom). No app.js change is needed: the app already shows database errors
--     as toasts and displays the masked message the database sends back.
--       strong = true : matched at the start of any word in messages ("fuck" also hits "fucking"),
--                       and matched anywhere inside a first name.
--       strong = false: matched only as a whole word (plus s/es/ed/ing/er) so normal words stay safe ("class", "assess").

create table if not exists public.banned_words (
  word   text primary key check (word = lower(word) and word ~ '^[a-z]{2,30}$'),
  strong boolean not null default false
);
alter table public.banned_words enable row level security;
revoke all on public.banned_words from anon, authenticated;

insert into public.banned_words (word, strong) values
  ('fuck', true), ('motherfucker', true), ('shit', true), ('bullshit', true), ('bitch', true), ('cunt', true),
  ('nigger', true), ('nigga', true), ('faggot', true), ('whore', true), ('slut', true), ('bastard', true),
  ('asshole', true), ('dumbass', true), ('jackass', true), ('wanker', true), ('twat', true), ('dildo', true), ('blowjob', true),
  ('ass', false), ('damn', false), ('dick', false), ('cock', false), ('piss', false), ('crap', false), ('pussy', false),
  ('fag', false), ('retard', false), ('tits', false), ('cum', false)
on conflict (word) do nothing;

-- Replace every swear word in a piece of text with # (same length). GIF tokens like :gif:name: are left alone.
create or replace function public.mask_profanity(t text) returns text
language plpgsql stable security definer set search_path = public as $$
declare s text; w text; out text := t; m text;
begin
  if t is null or t = '' or t ~ '^:u?gif:' then return t; end if;
  select string_agg(word, '|' order by length(word) desc) into s from banned_words where strong;
  select string_agg(word, '|' order by length(word) desc) into w from banned_words where not strong;
  if s is not null then
    for m in select q.m from (select distinct lower(x[1]) as m from regexp_matches(out, '\m((?:' || s || ')[a-z]*)', 'gi') x) q order by length(q.m) desc loop
      out := regexp_replace(out, '\m' || m, repeat('#', length(m)), 'gi');
    end loop;
  end if;
  if w is not null then
    for m in select distinct lower(x[1]) from regexp_matches(out, '\m((?:' || w || ')(?:s|es|ed|ing|er)?)\M', 'gi') x loop
      out := regexp_replace(out, '\m' || m || '\M', repeat('#', length(m)), 'gi');
    end loop;
  end if;
  return out;
end $$;
revoke execute on function public.mask_profanity(text) from public, anon, authenticated;

-- True if a name contains a blocked word (handles 0134578@$! lookalikes and separators like dots/spaces).
create or replace function public.name_is_blocked(t text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n text := translate(lower(coalesce(t, '')), '0134578@$!', 'oieastbasi'); letters text; toks text;
begin
  letters := regexp_replace(n, '[^a-z]', '', 'g');
  toks    := btrim(regexp_replace(n, '[^a-z]+', ' ', 'g'));
  return exists (
    select 1 from banned_words b
    where (b.strong and position(b.word in letters) > 0)
       or (not b.strong and toks ~ ('\m' || b.word || '(?:s|es|ed|ing|er)?\M')));
end $$;
revoke execute on function public.name_is_blocked(text) from public, anon, authenticated;

-- Messages (channels + DMs): mask on send and on edit.
create or replace function public.messages_mask_trg_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.content := public.mask_profanity(new.content);
  return new;
end $$;
revoke execute on function public.messages_mask_trg_fn() from public, anon, authenticated;
drop trigger if exists aa_messages_mask_trg on public.messages;
create trigger aa_messages_mask_trg before insert or update of content on public.messages
  for each row execute function public.messages_mask_trg_fn();

-- Profiles: refuse blocked first names; mask bio and custom status.
create or replace function public.profiles_clean_trg_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.first_name is distinct from old.first_name and public.name_is_blocked(new.first_name) then
    raise exception 'That name isn''t allowed. Please pick a different first name.';
  end if;
  new.bio := public.mask_profanity(new.bio);
  new.custom_status := public.mask_profanity(new.custom_status);
  return new;
end $$;
revoke execute on function public.profiles_clean_trg_fn() from public, anon, authenticated;
drop trigger if exists aa_profiles_clean_trg on public.profiles;
create trigger aa_profiles_clean_trg before update on public.profiles
  for each row execute function public.profiles_clean_trg_fn();

-- Poll options, suggestions and uploaded GIF names.
create or replace function public.mask_label_trg_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'poll_options' then new.label := public.mask_profanity(new.label);
  elsif tg_table_name = 'suggestions' then new.title := public.mask_profanity(new.title); new.body := public.mask_profanity(new.body);
  elsif tg_table_name = 'user_gifs' then new.name := public.mask_profanity(new.name);
  end if;
  return new;
end $$;
revoke execute on function public.mask_label_trg_fn() from public, anon, authenticated;
drop trigger if exists aa_poll_options_mask_trg on public.poll_options;
create trigger aa_poll_options_mask_trg before insert or update of label on public.poll_options
  for each row execute function public.mask_label_trg_fn();
drop trigger if exists aa_suggestions_mask_trg on public.suggestions;
create trigger aa_suggestions_mask_trg before insert or update of title, body on public.suggestions
  for each row execute function public.mask_label_trg_fn();
drop trigger if exists aa_user_gifs_mask_trg on public.user_gifs;
create trigger aa_user_gifs_mask_trg before insert or update of name on public.user_gifs
  for each row execute function public.mask_label_trg_fn();

-- Existing accounts with a blocked first name (this just lists them; rename them from Admin dashboard > Users > Rename).
select id, username, first_name from public.profiles where public.name_is_blocked(first_name);

-- ───────── Handy extras (not run automatically) ─────────
-- Add a word:     insert into public.banned_words (word, strong) values ('example', false) on conflict (word) do nothing;
-- Remove a word:  delete from public.banned_words where word = 'dick';
-- Clean up OLD messages too (they will show as "edited"):
--   update public.messages set content = public.mask_profanity(content) where content is distinct from public.mask_profanity(content);
