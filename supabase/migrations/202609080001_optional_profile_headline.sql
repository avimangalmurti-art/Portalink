-- Profile creation asks only for a name, optional image and optional location.
-- Preserve existing headlines while allowing new profiles to omit them.
begin;
alter table public.profiles drop constraint if exists profiles_headline_check;
alter table public.profiles add constraint profiles_headline_check
  check (char_length(headline) between 0 and 80);
alter table public.profiles alter column headline set default '';
commit;
