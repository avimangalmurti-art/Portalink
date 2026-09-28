-- Atomic owner arrangement writes and bounded visible engagement reads.
-- Profile density, media, category membership and audience rules are unchanged.
begin;

create or replace function public.save_profile_project_order(p_profile_id uuid, p_project_ids uuid[])
returns void language plpgsql set search_path = public as $$
declare current_ids uuid[]; next_ids uuid[]; has_wall_order boolean;
begin
  -- A profile lock serializes these arrangement RPCs. Row locks also protect
  -- against concurrent edits to existing projects; normal RLS stays in effect.
  perform 1 from public.profiles where id = p_profile_id and account_id = (select auth.uid()) for update;
  if not found then raise exception using errcode = '42501', message = 'Only the profile owner can arrange this work.'; end if;
  if p_project_ids is null or array_ndims(p_project_ids) > 1
    or cardinality(p_project_ids) <> (select count(distinct item) from unnest(p_project_ids) item) then
    raise exception 'Project order must contain distinct project IDs.';
  end if;
  perform 1 from public.projects where profile_id = p_profile_id order by id for update;
  select coalesce(bool_or(position < 0), false) into has_wall_order from public.projects where profile_id = p_profile_id;
  select coalesce(array_agg(id order by case when has_wall_order then position end, published_at desc, id), '{}'::uuid[])
    into current_ids from public.projects where profile_id = p_profile_id;
  if not p_project_ids <@ current_ids then raise exception 'That order contains a project this profile does not own.'; end if;
  select p_project_ids || coalesce(array_agg(item order by ordinal), '{}'::uuid[]) into next_ids
    from unnest(current_ids) with ordinality as current_order(item, ordinal) where not item = any(p_project_ids);
  update public.projects p set position = ordered.ordinal::integer - 1 - cardinality(next_ids)
    from unnest(next_ids) with ordinality ordered(id, ordinal)
    where p.id = ordered.id and p.profile_id = p_profile_id;
end;
$$;

create or replace function public.save_portfolio_arrangement(
  p_profile_id uuid, p_category_order uuid[], p_hidden_category_ids uuid[], p_category_icons jsonb
)
returns void language plpgsql set search_path = public as $$
declare current_ids uuid[];
begin
  perform 1 from public.profiles where id = p_profile_id and account_id = (select auth.uid()) for update;
  if not found then raise exception using errcode = '42501', message = 'Only the profile owner can arrange these portals.'; end if;
  if p_category_order is null or p_hidden_category_ids is null or p_category_icons is null
    or array_ndims(p_category_order) > 1 or array_ndims(p_hidden_category_ids) > 1
    or jsonb_typeof(p_category_icons) <> 'object'
    or cardinality(p_category_order) <> (select count(distinct item) from unnest(p_category_order) item)
    or cardinality(p_hidden_category_ids) <> (select count(distinct item) from unnest(p_hidden_category_ids) item) then
    raise exception 'Portal arrangement is invalid.';
  end if;
  perform 1 from public.portfolio_categories where profile_id = p_profile_id order by id for update;
  select coalesce(array_agg(id), '{}'::uuid[]) into current_ids from public.portfolio_categories where profile_id = p_profile_id;
  if not p_category_order <@ current_ids or not p_hidden_category_ids <@ p_category_order
    or exists (select 1 from jsonb_each(p_category_icons) as icon where jsonb_typeof(icon.value) <> 'string') then
    raise exception 'That arrangement refers to a portal this profile does not own.';
  end if;
  update public.portfolio_categories c set position = ordered.ordinal::integer - 1,
    is_hidden = c.id = any(p_hidden_category_ids), icon_name = coalesce(p_category_icons ->> c.id::text, 'FolderIcon')
    from unnest(p_category_order) with ordinality ordered(id, ordinal)
    where c.id = ordered.id and c.profile_id = p_profile_id;
end;
$$;

create or replace function public.save_project_arrangement(
  p_profile_id uuid, p_category_id uuid, p_project_order uuid[], p_hidden_project_ids uuid[], p_pinned_project_ids uuid[]
)
returns void language plpgsql set search_path = public as $$
declare profile_ids uuid[]; category_ids uuid[]; merged_ids uuid[]; has_wall_order boolean;
begin
  perform 1 from public.profiles where id = p_profile_id and account_id = (select auth.uid()) for update;
  if not found then raise exception using errcode = '42501', message = 'Only the profile owner can arrange this work.'; end if;
  perform 1 from public.portfolio_categories where id = p_category_id and profile_id = p_profile_id for update;
  if not found then raise exception 'That portal does not belong to this profile.'; end if;
  if p_project_order is null or p_hidden_project_ids is null or p_pinned_project_ids is null
    or array_ndims(p_project_order) > 1 or array_ndims(p_hidden_project_ids) > 1 or array_ndims(p_pinned_project_ids) > 1
    or cardinality(p_project_order) <> (select count(distinct item) from unnest(p_project_order) item)
    or cardinality(p_hidden_project_ids) <> (select count(distinct item) from unnest(p_hidden_project_ids) item)
    or cardinality(p_pinned_project_ids) <> (select count(distinct item) from unnest(p_pinned_project_ids) item) then
    raise exception 'Project arrangement is invalid.';
  end if;
  perform 1 from public.projects where profile_id = p_profile_id order by id for update;
  select coalesce(array_agg(id order by position, published_at desc, id), '{}'::uuid[]),
    coalesce(array_agg(id order by position, published_at desc, id) filter (where category_id = p_category_id), '{}'::uuid[]),
    coalesce(bool_or(position < 0), false)
    into profile_ids, category_ids, has_wall_order from public.projects where profile_id = p_profile_id;
  if cardinality(p_project_order) <> cardinality(category_ids) or not p_project_order <@ category_ids
    or not p_hidden_project_ids <@ category_ids or not p_pinned_project_ids <@ category_ids then
    raise exception 'That arrangement refers to work this category does not hold.';
  end if;
  -- SQL callers can supply one-dimensional arrays with zero/negative lower
  -- bounds. Normalize before indexing by the one-based category slot below.
  p_project_order := array(select unnest(p_project_order));
  if has_wall_order then
    -- Replace only the category's existing slots in the full wall order.
    select coalesce(array_agg(case when item = any(category_ids) then p_project_order[category_slot::integer] else item end order by ordinal), '{}'::uuid[])
      into merged_ids from (
        select item, ordinal, count(*) filter (where item = any(category_ids)) over (order by ordinal) as category_slot
        from unnest(profile_ids) with ordinality as current_order(item, ordinal)
      ) slots;
    update public.projects p set position = ordered.ordinal::integer - 1 - cardinality(merged_ids),
      is_hidden = case when p.category_id = p_category_id then p.id = any(p_hidden_project_ids) else p.is_hidden end,
      is_pinned = case when p.category_id = p_category_id then p.id = any(p_pinned_project_ids) else p.is_pinned end
      from unnest(merged_ids) with ordinality ordered(id, ordinal)
      where p.id = ordered.id and p.profile_id = p_profile_id;
  else
    update public.projects p set position = ordered.ordinal::integer - 1,
      is_hidden = p.id = any(p_hidden_project_ids), is_pinned = p.id = any(p_pinned_project_ids)
      from unnest(p_project_order) with ordinality ordered(id, ordinal)
      where p.id = ordered.id and p.profile_id = p_profile_id and p.category_id = p_category_id;
  end if;
end;
$$;

create or replace function public.project_engagement_summaries(p_project_ids uuid[])
returns table(project_id uuid, like_count bigint, save_count bigint, repost_count bigint, comment_count bigint,
  viewer_liked boolean, viewer_saved boolean, viewer_reposted boolean)
language plpgsql stable security definer set search_path = public as $$
declare viewer uuid := (select auth.uid());
begin
  if p_project_ids is null or cardinality(p_project_ids) > 200 or array_ndims(p_project_ids) > 1 then
    raise exception 'Request at most 200 project IDs at a time.';
  end if;
  return query
    with visible as materialized (
      select p.id from public.projects p
        join public.portfolio_categories c on c.id = p.category_id and c.profile_id = p.profile_id
      where p.id = any(p_project_ids)
        and (public.owns_profile(p.profile_id)
          or (not p.is_hidden and not c.is_hidden and public.can_view_profile(p.profile_id)))
    ), engagement as (
      select e.project_id, count(*) filter (where e.kind = 'like') likes,
        count(*) filter (where e.kind = 'save') saves, count(*) filter (where e.kind = 'repost') reposts,
        bool_or(e.kind = 'like' and e.account_id = viewer) liked,
        bool_or(e.kind = 'save' and e.account_id = viewer) saved,
        bool_or(e.kind = 'repost' and e.account_id = viewer) reposted
      from public.project_engagement e join visible v on v.id = e.project_id group by e.project_id
    ), comments as (
      select c.project_id, count(*) amount from public.project_comments c join visible v on v.id = c.project_id group by c.project_id
    )
    select v.id, coalesce(e.likes,0), coalesce(e.saves,0), coalesce(e.reposts,0), coalesce(c.amount,0),
      coalesce(e.liked,false), coalesce(e.saved,false), coalesce(e.reposted,false)
    from visible v left join engagement e on e.project_id = v.id left join comments c on c.project_id = v.id;
end;
$$;

revoke all on function public.save_profile_project_order(uuid,uuid[]),
  public.save_portfolio_arrangement(uuid,uuid[],uuid[],jsonb),
  public.save_project_arrangement(uuid,uuid,uuid[],uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.save_profile_project_order(uuid,uuid[]),
  public.save_portfolio_arrangement(uuid,uuid[],uuid[],jsonb),
  public.save_project_arrangement(uuid,uuid,uuid[],uuid[],uuid[]) to authenticated;
revoke all on function public.project_engagement_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.project_engagement_summaries(uuid[]) to anon, authenticated;
commit;
