-- Raises the chat message limit from 200 to 1000 characters.
-- Run once in Supabase: SQL Editor -> paste -> Run.
insert into public.site_settings (key, value) values ('chat_max_len', '1000')
on conflict (key) do update set value = '1000', updated_at = now();
