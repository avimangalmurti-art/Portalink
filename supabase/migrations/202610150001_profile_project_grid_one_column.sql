-- Pending review only; applying this database change needs separate approval.
-- Extend the existing owner-selected density range without changing saved data,
-- the default, nullability, ordering, policies, or grants.
begin;

alter table public.profiles
  drop constraint if exists profiles_project_grid_columns_check;

alter table public.profiles
  add constraint profiles_project_grid_columns_check
    check (project_grid_columns between 1 and 13);

comment on column public.profiles.project_grid_columns is
  'Owner-selected projects per row (1–13), shared by Home and the public profile. Independent of project ordering.';

commit;
