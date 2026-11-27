begin;

-- Projects keep their original category and identity. Extra placements only
-- attach them to another Portal belonging to the same creator.
create table public.project_portal_features (
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid not null references public.portfolio_categories(id) on delete cascade,
  primary key (project_id, category_id)
);

create index project_portal_features_category_id_idx
  on public.project_portal_features (category_id, project_id);

alter table public.project_portal_features enable row level security;
revoke all on table public.project_portal_features from public, anon, authenticated;
grant select on table public.project_portal_features to anon, authenticated;

-- A placement cannot grant access to a hidden project, to work in a hidden
-- primary Portal, or to a hidden destination. Owners can still manage these
-- placements. The normal profile policies govern private follower access.
create policy project_portal_features_read on public.project_portal_features
for select to anon, authenticated using (
  exists (
    select 1
    from public.projects project
    join public.portfolio_categories primary_portal
      on primary_portal.id = project.category_id and primary_portal.profile_id = project.profile_id
    join public.portfolio_categories featured_portal
      on featured_portal.id = project_portal_features.category_id
      and featured_portal.profile_id = project.profile_id
    where project.id = project_portal_features.project_id
      and featured_portal.id <> primary_portal.id
      and (
        public.owns_profile(project.profile_id)
        or (
          not project.is_hidden and not primary_portal.is_hidden and not featured_portal.is_hidden
          and public.can_view_profile(project.profile_id)
        )
      )
  )
);

create schema if not exists portalink_private;
revoke all on schema portalink_private from public, anon, authenticated;
grant usage on schema portalink_private to authenticated;

-- The write lives outside the exposed API schema. The owner check and row lock
-- let concurrent saves replace the whole selection without interleaving.
create function portalink_private.set_project_featured_portals(p_project_id uuid, p_category_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_profile_id uuid;
  primary_category_id uuid;
  category_ids uuid[];
begin
  select project.profile_id, project.category_id
    into owner_profile_id, primary_category_id
  from public.projects project
  join public.profiles creator on creator.id = project.profile_id
  where project.id = p_project_id and creator.account_id = (select auth.uid())
  for no key update of project;

  if not found then
    raise exception 'Only the owner can feature this project.' using errcode = '42501';
  end if;

  if p_category_ids is null or array_position(p_category_ids, null::uuid) is not null then
    raise exception 'Choose valid Portals.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct category_id order by category_id), '{}'::uuid[])
    into category_ids
  from unnest(p_category_ids) as requested(category_id)
  where category_id <> primary_category_id;

  if (select count(*) from public.portfolio_categories portal
      where portal.id = any(category_ids) and portal.profile_id = owner_profile_id) <> cardinality(category_ids) then
    raise exception 'Choose Portals in your own Catalogue.' using errcode = '22023';
  end if;

  delete from public.project_portal_features
  where project_id = p_project_id and category_id <> all(category_ids);

  insert into public.project_portal_features (project_id, category_id)
    select p_project_id, category_id from unnest(category_ids) as featured(category_id)
    on conflict (project_id, category_id) do nothing;

  return category_ids;
end;
$$;

revoke all on function portalink_private.set_project_featured_portals(uuid, uuid[]) from public, anon, authenticated;
grant execute on function portalink_private.set_project_featured_portals(uuid, uuid[]) to authenticated;

create function public.set_project_featured_portals(p_project_id uuid, p_category_ids uuid[])
returns uuid[]
language sql
security invoker
set search_path = ''
as $$
  select portalink_private.set_project_featured_portals(p_project_id, p_category_ids);
$$;

revoke all on function public.set_project_featured_portals(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_project_featured_portals(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
