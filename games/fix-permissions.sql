-- ===== Fix: "permission denied for table scores" in the admin panel =====
-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

-- Staff are signed in, so the database treats them as the "authenticated" role.
-- That role was only given UPDATE/DELETE on scores. To change or remove a row, Postgres also has to be
-- allowed to READ the columns it filters on (name, id...), so those actions failed.
grant select on public.scores to authenticated;

-- signed-in people can read the leaderboard like everyone else
drop policy if exists scores_auth_read on public.scores;
create policy scores_auth_read on public.scores for select to authenticated using (true);

-- admins may edit rows (Remove name / Remove avatar). Delete already has its own policy.
drop policy if exists scores_admin_update on public.scores;
create policy scores_admin_update on public.scores for update to authenticated
  using (has_level('admin')) with check (has_level('admin'));

-- same problem for the new names table: staff need table access on top of the policy
grant select, insert, update, delete on public.player_names to authenticated;
