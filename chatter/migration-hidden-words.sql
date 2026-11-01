-- ═══════════════════════════════════════════════════════════════════════════
-- Chatter: owner-only HIDDEN banned words
-- Run AFTER migration-moderation.sql. Safe to re-run.
-- The owner types words in Admin dashboard -> Moderation -> Hidden words. They are blocked everywhere
-- (chat, DMs, names, bios...), count as warnings like normal profanity, and are never shown again to anyone:
-- not in the word list, not in the events list, not in the filter tester.
-- ═══════════════════════════════════════════════════════════════════════════

alter table mod_terms add column if not exists hidden boolean not null default false;

-- Add one or many words (separate with commas or new lines). Never echoes the words back.
create or replace function mod_hidden_add(p_words text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x text; t text; added int := 0; existing int := 0; invalid int := 0; r mod_terms%rowtype;
begin
  if not is_owner() then raise exception 'Only the owner can do that.'; end if;
  for x in select unnest(regexp_split_to_array(coalesce(p_words, ''), '[,;\n\r]+')) loop
    t := lower(regexp_replace(btrim(x), '\s+', ' ', 'g'));
    continue when t = '';
    if t !~ '^[a-z]+( [a-z]+){0,5}$' or char_length(t) < 2 or char_length(t) > 60 then invalid := invalid + 1; continue; end if;
    select * into r from mod_terms where term = t and applies = 'all';
    if found then
      if r.enabled then existing := existing + 1;
      else update mod_terms set enabled = true where id = r.id; added := added + 1; end if;
    else
      insert into mod_terms (term, category, match, applies, weight, enabled, built_in, hidden, note, created_by)
      values (t, 'profanity', 'word', 'all', 1, true, false, true, '', auth.uid());
      added := added + 1;
    end if;
    delete from mod_allow where word = t;   -- the owner explicitly wants it blocked
  end loop;
  if added > 0 then perform log_action('moderation.term', null, jsonb_build_object('hidden', true, 'added', added)); end if;
  return jsonb_build_object('added', added, 'existing', existing, 'invalid', invalid,
                            'total', (select count(*) from mod_terms where hidden));
end $$;

-- Lists hidden words WITHOUT the words themselves.
create or replace function mod_hidden_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Only the owner can do that.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at, 'enabled', enabled) order by created_at desc)
                   from mod_terms where hidden), '[]'::jsonb);
end $$;

create or replace function mod_hidden_remove(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Only the owner can do that.'; end if;
  delete from mod_terms where id = p_id and hidden;
  perform log_action('moderation.term', null, jsonb_build_object('hidden', true, 'removed', true));
end $$;

-- The normal word list never includes hidden words.
create or replace function mod_get_config() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm('manage_moderation') then raise exception 'You do not have permission to do that.'; end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from mod_settings s where id = 1),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'term', term, 'category', category, 'match', match, 'applies', applies,
                'weight', weight, 'enabled', enabled, 'built_in', built_in, 'note', note) order by category, term) from mod_terms where not hidden), '[]'::jsonb),
    'allow', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'note', note) order by word) from mod_allow), '[]'::jsonb));
end $$;

-- The filter tester hides the matched word when it is a hidden one.
create or replace function mod_test(p_text text, p_scope text default 'chat') returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not (has_perm('view_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  r := mod_scan(p_text, case when p_scope = 'name' then 'name' else 'chat' end);
  if r is not null and exists (select 1 from mod_terms where hidden and term = r->>'term') then
    r := r || jsonb_build_object('term', '(hidden word)', 'matched', '(hidden word)');
  end if;
  return jsonb_build_object('result', r, 'normalized', left(mod_collapse(mod_norm(p_text)), 300));
end $$;

-- The events list hides the matched word and the message text when a hidden word caused the block.
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
      select e.id, e.created_at, e.user_id, p.display_name, p.username, e.surface, e.category, e.term,
             case when hid.v then '(hidden word)' else e.matched end as matched,
             case when hid.v and e.excerpt <> '' then '(message contains a hidden word)' when hid.v then '' else e.excerpt end as excerpt,
             e.points, e.action, e.timeout_seconds, e.status, e.reviewed_at,
             (select coalesce(sum(y.points), 0) from mod_events y where y.user_id = e.user_id and y.status <> 'dismissed'
                and y.created_at > now() - make_interval(hours => st.window_hours)) as strikes,
             (select sm.timeout_until from server_members sm where sm.server_id = main_server() and sm.user_id = e.user_id and sm.timeout_until > now()) as timed_out_until
      from mod_events e join profiles p on p.id = e.user_id
      cross join lateral (select exists (select 1 from mod_terms t where t.hidden and t.term = e.term) as v) hid
      where (p_status = 'all' or e.status = p_status) and (p_before is null or e.created_at < p_before)
      order by e.created_at desc limit least(greatest(coalesce(p_limit, 60), 1), 200)) x), '[]'::jsonb));
end $$;

-- "Not a violation" must never copy a hidden word into the visible allowed-words list.
create or replace function mod_review_event(p_id uuid, p_action text, p_allow boolean default false, p_lift boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev mod_events%rowtype; w text; added text;
begin
  if not (has_perm('resolve_reports') or has_perm('manage_moderation')) then raise exception 'You do not have permission to do that.'; end if;
  if p_action not in ('dismiss','confirm') then raise exception 'Unknown action.'; end if;
  select * into ev from mod_events where id = p_id for update;
  if not found then raise exception 'That event no longer exists.'; end if;
  update mod_events set status = case p_action when 'dismiss' then 'dismissed' else 'confirmed' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if p_allow and not exists (select 1 from mod_terms where hidden and term = ev.term) then
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

revoke execute on function mod_hidden_add(text), mod_hidden_list(), mod_hidden_remove(uuid) from public, anon;
grant execute on function mod_hidden_add(text), mod_hidden_list(), mod_hidden_remove(uuid) to authenticated;
