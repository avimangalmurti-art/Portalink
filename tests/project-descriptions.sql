-- Run after the migration, as one batch. All temporary draft/project inserts
-- and the existing project's test edit are rolled back, including revisions.
begin;
select set_config('request.jwt.claim.sub', (
  select p.account_id::text from public.profiles p
  where exists (select 1 from public.projects j join public.project_attachments a
    on a.project_id = j.id where j.profile_id = p.id) limit 1
), true);
set local role authenticated;
do $$
declare
  existing public.projects%rowtype;
  test_draft uuid;
  test_project uuid;
  long_description text := repeat(E'Paragraph one — café 🌍.\n\nParagraph two with more information.\n', 3000);
  kept jsonb;
begin
  select j.* into existing from public.projects j
    where public.owns_profile(j.profile_id)
    and exists (select 1 from public.project_attachments a where a.project_id = j.id)
    limit 1;
  if existing.id is null then raise exception 'Test requires an owned project with an attachment'; end if;

  -- No file upload is needed to prove that both publishing entry points get
  -- past description validation and still correctly reject missing media.
  begin
    perform public.publish_project(gen_random_uuid(), existing.profile_id, existing.category_id,
      'Long description regression', long_description, '[]'::jsonb);
    raise exception 'Media validation unexpectedly passed';
  exception when others then
    if sqlerrm <> 'invalid media' then raise; end if;
  end;
  begin
    perform public.publish_project(gen_random_uuid(), existing.profile_id, existing.category_id,
      'Long description regression', long_description, '[]'::jsonb,
      array[]::text[], '', 'global', 0::real);
    raise exception 'Extended media validation unexpectedly passed';
  exception when others then
    if sqlerrm <> 'invalid media' then raise; end if;
  end;

  insert into public.project_drafts(profile_id, category_id, title, summary)
    values(existing.profile_id, existing.category_id, 'Long description regression', long_description)
    returning id into test_draft;
  if (select summary from public.project_drafts where id = test_draft) is distinct from long_description then
    raise exception 'Draft description was shortened';
  end if;
  insert into public.projects(profile_id, category_id, title, summary)
    values(existing.profile_id, existing.category_id, 'Long description regression', long_description)
    returning id into test_project;
  if (select summary from public.projects where id = test_project) is distinct from long_description then
    raise exception 'Project description was shortened';
  end if;

  -- Keep every existing attachment untouched; this tests only the prose edit.
  select jsonb_agg(jsonb_build_object('id', id, 'displayName', display_name,
      'order', position, 'isCover', is_cover)) into kept
    from public.project_attachments where project_id = existing.id;
  perform public.update_project(existing.id, existing.profile_id, existing.title,
    long_description, kept, '[]'::jsonb, null);
  if (select summary from public.projects where id = existing.id) is distinct from long_description then
    raise exception 'Edited description was shortened';
  end if;
end;
$$;
rollback;
select 'Passed: long descriptions in drafts, both publishing entry points, project storage and edits; all test writes rolled back.' as result;
