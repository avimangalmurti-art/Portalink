-- Run as the database administrator after the migration, in a single batch.
-- Uses an existing profile with a saved manual order. Every test write is
-- rolled back: no projects, positions, revisions or timestamps are retained.
begin;
-- Exercise the authenticated owner's real RLS permissions, not an admin-only
-- insert. Both the role and claims are local to this rollback-only transaction.
select set_config('request.jwt.claim.sub', (
  select account_id::text from public.profiles where id = (
    select profile_id from public.projects group by profile_id
    having min(position) < 0 limit 1
  )
), true);
set local role authenticated;
do $$
declare
  test_profile uuid;
  test_category uuid;
  first_position integer;
  original_positions jsonb;
  first_upload uuid;
  second_upload uuid;
  actual_position integer;
  actual_first uuid;
begin
  select profile_id into test_profile from public.projects
  group by profile_id having min(position) < 0 limit 1;
  if test_profile is null then
    raise exception 'Test requires a profile with a saved manual order';
  end if;
  perform 1 from public.profiles where id = test_profile for update;
  select min(position), jsonb_object_agg(id::text, position)
    into first_position, original_positions
    from public.projects where profile_id = test_profile;
  -- Prefer a different category from the leading project: the new position
  -- must be computed across the entire profile, not just its upload category.
  select category_id into test_category from public.projects
    where profile_id = test_profile order by position desc limit 1;

  insert into public.projects(profile_id, category_id, title, summary, position)
    values(test_profile, test_category, 'Ordering regression 1', 'Rollback-only test', 100)
    returning id, position into first_upload, actual_position;
  if actual_position <> first_position - 1 then
    raise exception 'New upload did not precede the saved profile order';
  end if;
  insert into public.projects(profile_id, category_id, title, summary, position)
    values(test_profile, test_category, 'Ordering regression 2', 'Rollback-only test', 101)
    returning id, position into second_upload, actual_position;
  if actual_position <> first_position - 2 then
    raise exception 'Successive uploads did not get successively earlier positions';
  end if;
  select id into actual_first from public.projects where profile_id = test_profile
    order by position, published_at desc limit 1;
  if actual_first <> second_upload then
    raise exception 'Most recent upload is not the first project';
  end if;
  if (select jsonb_object_agg(id::text, position) from public.projects
      where profile_id = test_profile and id not in (first_upload, second_upload))
      is distinct from original_positions then
    raise exception 'Publishing changed existing project positions';
  end if;

  update public.projects set title = 'Edited ordering regression'
    where id = first_upload returning position into actual_position;
  if actual_position <> first_position - 1 then
    raise exception 'Editing a project unexpectedly moved it';
  end if;

  -- Exercise the legacy/non-manual path in the same rollback-only transaction.
  update public.projects set position = position - (first_position - 2)
    where profile_id = test_profile;
  insert into public.projects(profile_id, category_id, title, summary, position)
    values(test_profile, test_category, 'Unarranged profile regression', 'Rollback-only test', 42)
    returning position into actual_position;
  if actual_position <> 42 then
    raise exception 'Legacy category position was unexpectedly rewritten';
  end if;
end;
$$;
rollback;
select 'Passed: new uploads first, existing order preserved, edits stable, legacy positions retained; all test writes rolled back.' as result;
