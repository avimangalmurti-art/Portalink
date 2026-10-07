-- PREPARED ONLY. Existing creator_beta SQL already declares read_at.
-- This idempotent repair is needed only if the live column is absent.
begin;
alter table public.notifications add column if not exists read_at timestamptz;
notify pgrst, 'reload schema';
commit;
