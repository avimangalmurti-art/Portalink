begin;

alter table public.portfolio_categories
  add constraint portfolio_categories_profile_id_id_key unique (profile_id, id);

-- Parent links organize existing Portals without changing their independent
-- visibility, share addresses, or project membership.
create table public.portal_hierarchy (
  profile_id uuid not null,
  child_category_id uuid primary key,
  parent_category_id uuid not null,
  constraint portal_hierarchy_distinct_categories check (child_category_id <> parent_category_id),
  constraint portal_hierarchy_child_fk foreign key (profile_id, child_category_id)
    references public.portfolio_categories (profile_id, id) on delete cascade,
  constraint portal_hierarchy_parent_fk foreign key (profile_id, parent_category_id)
    references public.portfolio_categories (profile_id, id) on delete no action deferrable initially deferred
);

create index portal_hierarchy_parent_idx
  on public.portal_hierarchy (profile_id, parent_category_id);

alter table public.portal_hierarchy enable row level security;
revoke all on table public.portal_hierarchy from public, anon, authenticated, service_role;
grant select on table public.portal_hierarchy to anon, authenticated;

-- These lookups run under the caller's category RLS. A visitor can read the
-- relationship only when both endpoints are already visible to that visitor.
create policy portal_hierarchy_read on public.portal_hierarchy
for select to anon, authenticated
using (
  (select public.is_account_session_active())
  and exists (
    select 1 from public.portfolio_categories parent
    where parent.id = parent_category_id and parent.profile_id = portal_hierarchy.profile_id
  )
  and exists (
    select 1 from public.portfolio_categories child
    where child.id = child_category_id and child.profile_id = portal_hierarchy.profile_id
  )
);

-- A placement can only be added while creating a new child. With no public
-- write access to placements, a child can never be moved into its own subtree.
create function portalink_private.create_sub_portal(
  p_profile_id uuid, p_parent_category_id uuid, p_label text,
  p_icon_name text, p_format text, p_blurb text
)
returns public.portfolio_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.portfolio_categories;
begin
  if (select auth.uid()) is null
    or (select auth.jwt()->>'is_anonymous') = 'true'
    or not (select public.is_account_session_active()) then
    raise exception 'Sign in to create a subportal.' using errcode = '42501';
  end if;

  perform 1 from public.profiles profile
  where profile.id = p_profile_id and profile.account_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Only the profile owner can create a subportal.' using errcode = '42501';
  end if;

  perform 1 from public.portfolio_categories parent
  where parent.id = p_parent_category_id and parent.profile_id = p_profile_id
  for key share;
  if not found then
    raise exception 'Choose a parent Portal in your own Catalogue.' using errcode = '22023';
  end if;

  insert into public.portfolio_categories (profile_id, label, icon_name, format, blurb, position)
    select p_profile_id, btrim(p_label), coalesce(p_icon_name, 'FolderIcon'),
           coalesce(p_format, 'grid'), coalesce(btrim(p_blurb), ''), coalesce(max(portal.position), -1) + 1
    from public.portfolio_categories portal
    where portal.profile_id = p_profile_id
    returning * into created;

  insert into public.portal_hierarchy (profile_id, child_category_id, parent_category_id)
  values (p_profile_id, created.id, p_parent_category_id);
  return created;
end;
$$;

revoke all on function portalink_private.create_sub_portal(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function portalink_private.create_sub_portal(uuid, uuid, text, text, text, text) to authenticated;

create function public.create_sub_portal(
  p_profile_id uuid, p_parent_category_id uuid, p_label text,
  p_icon_name text, p_format text, p_blurb text
)
returns public.portfolio_categories
language sql
security invoker
set search_path = ''
as $$
  select * from portalink_private.create_sub_portal(p_profile_id, p_parent_category_id, p_label, p_icon_name, p_format, p_blurb);
$$;

revoke all on function public.create_sub_portal(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_sub_portal(uuid, uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
