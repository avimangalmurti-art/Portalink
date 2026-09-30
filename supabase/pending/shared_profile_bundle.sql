-- PREPARED ONLY. Requires cover_thumbnail_schema.sql, not the public bucket.
-- The owner receives the same explicitly public projection as an anonymous user.
begin;
create or replace function public.shared_profile_bundle(profile_id uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  with visible_profile as (
    select u.* from public.profiles u where u.id=$1 and not u.is_private
  ), visible_categories as (
    select c.* from public.portfolio_categories c join visible_profile u on u.id=c.profile_id where not c.is_hidden
  ), visible_projects as (
    select p.* from public.projects p join visible_categories c on c.id=p.category_id and c.profile_id=p.profile_id
    where p.profile_id=$1 and not p.is_hidden
  ), cover_rows as (
    select distinct a.* from visible_projects p
    cross join lateral (
      (select x.* from public.project_attachments x where x.project_id=p.id
       order by x.is_cover desc,(x.kind='image') desc,x.position,x.id limit 1)
      union all
      (select x.* from public.project_attachments x where x.project_id=p.id and x.kind='image'
       order by x.position,x.id limit 1)
    ) a
  ) select jsonb_build_object(
    'profile',jsonb_build_object('id',u.id,'name',u.name,'handle',u.handle,'headline',u.headline,
      'location',u.location,'avatar_url',u.avatar_url,'nav_heading',u.nav_heading,'stats',u.stats,
      'social_links',u.social_links,'links',u.links,'is_private',false,
      'public_appearance',u.public_appearance,'project_grid_columns',u.project_grid_columns),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'profile_id',c.profile_id,
      'label',c.label,'icon_name',c.icon_name,'format',c.format,'blurb',c.blurb,'position',c.position,'is_hidden',false)
      order by c.position,c.id) from visible_categories c),'[]'::jsonb),
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'profile_id',p.profile_id,'category_id',p.category_id,
      'title',p.title,'summary',p.summary,'design',p.design,'position',p.position,'is_hidden',false,'is_pinned',p.is_pinned,
      'published_at',p.published_at,'revision',p.revision,'cover_thumbnail',p.cover_thumbnail,
      'topic_keys',p.topic_keys,'content_location',p.content_location,'geographic_scope',p.geographic_scope,
      'geography_confidence',p.geography_confidence,
      'kind',(select a.kind from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),
      'page_count',coalesce((select case when a.kind='document' and a.metadata->>'pageCount' ~ '^[0-9]{1,9}$'
        then (a.metadata->>'pageCount')::integer else 0 end from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),0))
      order by p.published_at desc,p.id) from visible_projects p),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'project_id',a.project_id,'kind',a.kind,
      'file_name',a.file_name,'display_name',a.display_name,'extension',a.extension,'mime_type',a.mime_type,
      'size_bytes',a.size_bytes,'type_label',a.type_label,'storage_path',a.storage_path,'status',a.status,
      'is_cover',a.is_cover,'position',a.position,'metadata',
      coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(a.metadata)='object' then a.metadata else '{}'::jsonb end)
        where key in ('multipart','durationSeconds','pageCount','widthPixels','heightPixels','aspectRatio',
          'processingError','failedPage','coverPageNumber','coverFrame','playbackVideo')),'{}'::jsonb)
      || case when jsonb_typeof(a.metadata->'renderedPages')='array' then jsonb_build_object('renderedPages',coalesce((
        select jsonb_agg(page) from (
          select page from jsonb_array_elements(a.metadata->'renderedPages') page
          where page->>'attachmentId'=a.id and page->>'withinDocumentIndex'=case
            when a.metadata->>'coverPageNumber' ~ '^[1-9][0-9]*$' then a.metadata->>'coverPageNumber' else '1' end
          limit 1
        ) selected_page),'[]'::jsonb)) else '{}'::jsonb end)
      order by a.project_id,a.position,a.id) from cover_rows a),'[]'::jsonb)
  ) from visible_profile u;
$$;
revoke all on function public.shared_profile_bundle(uuid) from public;
grant execute on function public.shared_profile_bundle(uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
