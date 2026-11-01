-- RAISE THE RECORDING LIMIT TO 20 MINUTES. Run once in Supabase: SQL Editor > New query > paste > Run. Safe to re-run.
-- Needs recordings-setup.sql to have been run first.
-- Note: Supabase's project-wide upload cap (Storage settings) must be at least 50 MB; the free plan's maximum is 50 MB.

update storage.buckets set file_size_limit = 52428800 where id = 'recordings';

alter table public.recordings drop constraint if exists recordings_secs_check;
alter table public.recordings add constraint recordings_secs_check check (secs between 1 and 1200);
alter table public.recordings drop constraint if exists recordings_bytes_check;
alter table public.recordings add constraint recordings_bytes_check check (bytes between 1 and 52428800);
