begin;

-- A Portal's local arrangement can mix home and featured projects while each
-- featured copy keeps the same project identity and privacy as its original.
create table public.portal_project_positions (
  category_id uuid not null references public.portfolio_categories(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (category_id, project_id)
);

create index portal_project_positions_project_id_idx
  on public.portal_project_positions (project_id);

alter table public.portal_project_positions enable row level security;
revoke all on public.portal_project_positions from public, anon, authenticated;
grant select on public.portal_project_positions to anon, authenticated;

create policy portal_project_positions_read on public.portal_project_positions
for select to anon, authenticated using (
  exists (
    select 1 from public.portfolio_categories as portal
    join public.projects as project on project.profile_id = portal.profile_id
    where portal.id = portal_project_positions.category_id
      and project.id = portal_project_positions.project_id
      and (
        project.category_id = portal.id
        or exists (
          select 1 from public.project_portal_features as feature
          where feature.category_id = portal.id and feature.project_id = project.id
        )
      )
  )
);

create function public.get_portal_project_arrangement(p_profile_id uuid, p_category_id uuid)
returns table(project_id uuid, is_hidden boolean, is_pinned boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select project.id,
    project.category_id = portal.id and project.is_hidden,
    project.category_id = portal.id and project.is_pinned
  from public.portfolio_categories as portal
  join public.projects as project on project.profile_id = portal.profile_id
  left join public.project_portal_features as feature
    on feature.category_id = portal.id and feature.project_id = project.id
  left join public.portal_project_positions as ranked
    on ranked.category_id = portal.id and ranked.project_id = project.id
  where portal.id = p_category_id and portal.profile_id = p_profile_id
    and (project.category_id = portal.id or feature.project_id is not null)
  order by ranked.position nulls last, (project.category_id = portal.id) desc,
    case when project.category_id = portal.id then project.position end,
    project.published_at desc, project.id;
$$;

revoke all on function public.get_portal_project_arrangement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_portal_project_arrangement(uuid, uuid) to anon, authenticated;

create function portalink_private.save_portal_project_arrangement(
  p_profile_id uuid, p_category_id uuid, p_project_order uuid[], p_hidden_project_ids uuid[], p_pinned_project_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  home_ids uuid[];
  hidden_ids uuid[];
  pinned_ids uuid[];
  featured_ids uuid[];
  next_home_ids uuid[];
begin
  perform 1 from public.profiles
    where id = p_profile_id and account_id = (select auth.uid())
    for update;
  if not found then
    raise exception 'Only the profile owner can arrange this work.' using errcode = '42501';
  end if;

  -- Feature edits take a project row lock and then check the foreign keys.
  -- Hold a key-share-compatible lock on the destination until projects are locked.
  perform 1 from public.portfolio_categories
    where id = p_category_id and profile_id = p_profile_id
    for no key update;
  if not found then
    raise exception 'That Portal does not belong to this profile.' using errcode = '22023';
  end if;

  if p_project_order is null or p_hidden_project_ids is null or p_pinned_project_ids is null
    or pg_catalog.array_ndims(p_project_order) > 1
    or pg_catalog.array_ndims(p_hidden_project_ids) > 1
    or pg_catalog.array_ndims(p_pinned_project_ids) > 1
    or pg_catalog.cardinality(p_project_order) <> (select count(distinct id) from unnest(p_project_order) as item(id))
    or pg_catalog.cardinality(p_hidden_project_ids) <> (select count(distinct id) from unnest(p_hidden_project_ids) as item(id))
    or pg_catalog.cardinality(p_pinned_project_ids) <> (select count(distinct id) from unnest(p_pinned_project_ids) as item(id)) then
    raise exception 'Project arrangement is invalid.' using errcode = '22023';
  end if;

  -- Use the same profile lock and project order as the legacy arrangement.
  -- Feature membership changes lock these project rows before writing.
  perform 1 from public.projects where profile_id = p_profile_id order by id for no key update;

  select coalesce(array_agg(id order by position, published_at desc, id), '{}'::uuid[]),
    coalesce(array_agg(id) filter (where is_hidden), '{}'::uuid[]),
    coalesce(array_agg(id) filter (where is_pinned), '{}'::uuid[])
  into home_ids, hidden_ids, pinned_ids
  from public.projects
  where profile_id = p_profile_id and category_id = p_category_id;

  select coalesce(array_agg(project.id), '{}'::uuid[])
  into featured_ids
  from public.project_portal_features as feature
  join public.projects as project on project.id = feature.project_id
  join public.portfolio_categories as home on home.id = project.category_id
    and home.profile_id = project.profile_id
  where feature.category_id = p_category_id
    and project.profile_id = p_profile_id and project.category_id <> p_category_id;

  if pg_catalog.cardinality(p_project_order) <> pg_catalog.cardinality(home_ids) + pg_catalog.cardinality(featured_ids)
    or not p_project_order <@ (home_ids || featured_ids)
    or not p_hidden_project_ids <@ home_ids
    or not p_pinned_project_ids <@ home_ids then
    raise exception 'That arrangement refers to work this Portal does not hold.' using errcode = '22023';
  end if;

  select coalesce(array_agg(requested.id order by requested.ordinal), '{}'::uuid[]) into next_home_ids
  from unnest(p_project_order) with ordinality as requested(id, ordinal)
  where requested.id = any(home_ids);

  if next_home_ids <> home_ids or not hidden_ids <@ p_hidden_project_ids or not p_hidden_project_ids <@ hidden_ids
    or not pinned_ids <@ p_pinned_project_ids or not p_pinned_project_ids <@ pinned_ids then
    perform public.save_project_arrangement(
      p_profile_id, p_category_id, next_home_ids, p_hidden_project_ids, p_pinned_project_ids
    );
  end if;

  if pg_catalog.cardinality(featured_ids) > 0 or exists (
    select 1 from public.portal_project_positions where category_id = p_category_id
  ) then
    delete from public.portal_project_positions
    where category_id = p_category_id and project_id <> all(p_project_order);

    insert into public.portal_project_positions as ranked (category_id, project_id, position)
    select p_category_id, requested.id, (requested.ordinal - 1)::integer
    from unnest(p_project_order) with ordinality as requested(id, ordinal)
    on conflict (category_id, project_id) do update set position = excluded.position
    where ranked.position <> excluded.position;
  end if;
end;
$$;

revoke all on function portalink_private.save_portal_project_arrangement(uuid, uuid, uuid[], uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function portalink_private.save_portal_project_arrangement(uuid, uuid, uuid[], uuid[], uuid[])
  to authenticated;

create function public.save_portal_project_arrangement(
  p_profile_id uuid, p_category_id uuid, p_project_order uuid[], p_hidden_project_ids uuid[], p_pinned_project_ids uuid[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select portalink_private.save_portal_project_arrangement(
    p_profile_id, p_category_id, p_project_order, p_hidden_project_ids, p_pinned_project_ids
  );
$$;

revoke all on function public.save_portal_project_arrangement(uuid, uuid, uuid[], uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.save_portal_project_arrangement(uuid, uuid, uuid[], uuid[], uuid[])
  to authenticated;

create function portalink_private.remove_featured_project_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.portal_project_positions
  where category_id = old.category_id and project_id = old.project_id;
  return old;
end;
$$;

revoke all on function portalink_private.remove_featured_project_position() from public, anon, authenticated;

create trigger project_portal_features_remove_position
  after delete on public.project_portal_features
  for each row execute function portalink_private.remove_featured_project_position();

notify pgrst, 'reload schema';

commit;
