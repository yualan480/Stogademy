-- Orbit Games project: grant tightening (defence in depth). Run in Supabase SQL Editor. Safe to re-run. No feature changes.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
-- old score backups: nobody should reach them through the API
revoke all on public.scores_backup_before_halving, public.scores_backup_ethan_tetris, public.scores_backup_before_reset from anon, authenticated;
-- the admin log is written only by the audit trigger (security definer), never directly
revoke insert, update, delete on public.admin_log from anon, authenticated;
-- admin-only functions: signed-in staff only (each one still checks has_level inside)
revoke execute on function public.admin_clear_chat(), public.admin_dashboard(), public.admin_players(text), public.admin_reset_scores(text), public.admin_remove_player(text), public.admin_rename_player(text, text) from public, anon;
grant execute on function public.admin_clear_chat(), public.admin_dashboard(), public.admin_players(text), public.admin_reset_scores(text), public.admin_remove_player(text), public.admin_rename_player(text, text) to authenticated;
