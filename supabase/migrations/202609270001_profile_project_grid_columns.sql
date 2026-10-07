-- One owner-controlled project-card density shared by Home and public profile.
-- Existing profile read/write policies and grants continue to apply unchanged.
begin;

alter table public.profiles
  add column if not exists project_grid_columns smallint not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_project_grid_columns_check'
  ) then
    alter table public.profiles add constraint profiles_project_grid_columns_check
      check (project_grid_columns between 2 and 13);
  end if;
end $$;

comment on column public.profiles.project_grid_columns is
  'Owner-selected projects per row (2–13), shared by Home and the public profile. Independent of project ordering.';

commit;
