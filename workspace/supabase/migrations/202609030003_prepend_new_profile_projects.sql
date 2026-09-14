-- A manually arranged profile uses negative, profile-wide positions. The
-- publish RPC still supplies a per-category append position, which otherwise
-- sends the next upload to the end of the profile. Prepend only new projects;
-- editing a project and the owner's existing manual order remain unchanged.
create or replace function public.prepend_new_profile_project()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  first_position integer;
begin
  -- Serialize uploads to the same profile before choosing a position. Keep
  -- the caller's RLS/ownership checks; this function grants no extra access.
  perform 1 from public.profiles where id = new.profile_id for update;

  select min(position) into first_position
  from public.projects where profile_id = new.profile_id;

  if first_position < 0 then
    new.position := first_position - 1;
  end if;
  -- With no manual order, retain legacy category positions. Profile readers
  -- already present those projects by published_at descending (newest first).
  return new;
end;
$$;

create trigger projects_prepend_to_profile
before insert on public.projects
for each row execute function public.prepend_new_profile_project();
