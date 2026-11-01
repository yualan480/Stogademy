-- Orbit Chat project: grant tightening (defence in depth). Run in Supabase SQL Editor. Safe to re-run. No feature changes.
-- RLS and the SQL functions stay the real gate; this removes rights nobody needs, so a future policy mistake cannot expose them.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
-- the Orbit balance is only ever changed by the SECURITY DEFINER functions (claim_*, buy_shop_item, ...), never by direct writes
revoke insert, update, delete on public.orbit_ledger from anon, authenticated;
