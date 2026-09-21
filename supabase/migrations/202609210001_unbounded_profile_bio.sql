-- Bio uses the existing text column. Remove only its product length limit;
-- retain all existing values, defaults, NOT NULL, permissions and RLS policies.
begin;
alter table public.profiles drop constraint if exists profiles_headline_check;
commit;
