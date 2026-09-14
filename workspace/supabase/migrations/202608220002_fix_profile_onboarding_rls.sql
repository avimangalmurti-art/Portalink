-- Let a creator read the profile row returned by the same INSERT statement.
--
-- The original policy only called can_view_profile(id). That stable helper
-- looks the profile up in a separate query, whose snapshot cannot see a row
-- that is still being inserted. PostgREST uses INSERT ... RETURNING when the
-- client asks for the created row, so an otherwise valid insert was rejected
-- with SQLSTATE 42501. Checking ownership directly against the candidate row
-- keeps the public/private visibility helper while allowing onboarding.
drop policy if exists profiles_read on public.profiles;

create policy profiles_read
on public.profiles
for select
to anon, authenticated
using (
  account_id = (select auth.uid())
  or public.can_view_profile(id)
);
