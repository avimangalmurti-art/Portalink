-- PREPARED ONLY: explicit approval required. No database changes have been applied.
-- Reuses Moment1 story_answers.learned; no duplicate learned column.
-- Includes its prerequisites so this can be reconciled/applied independently.
begin;
do $context$
declare introduced boolean := not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='story_answers');
begin
alter table public.projects
  add column if not exists made_in text,
  add column if not exists field text,
  add column if not exists story_answers jsonb;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_made_in_month') then
alter table public.projects add constraint projects_made_in_month
  check (made_in is null or made_in ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
end if;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_field_length') then
alter table public.projects add constraint projects_field_length
  check (field is null or char_length(field) <= 120);
end if;
if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_story_answers_shape') then
alter table public.projects add constraint projects_story_answers_shape
  check (story_answers is null or (
    jsonb_typeof(story_answers) = 'object'
    and story_answers - 'what' - 'did' - 'learned' = '{}'::jsonb
    and (not story_answers ? 'what' or (jsonb_typeof(story_answers->'what') = 'string' and char_length(story_answers->>'what') <= 20000))
    and (not story_answers ? 'did' or (jsonb_typeof(story_answers->'did') = 'string' and char_length(story_answers->>'did') <= 20000))
    and (not story_answers ? 'learned' or (jsonb_typeof(story_answers->'learned') = 'string' and char_length(story_answers->>'learned') <= 20000))
  ));
end if;
-- Copy source-only compatibility data; retain JSON for older readers/bundle RPCs.
if introduced then
update public.projects set
  made_in = nullif(design->'projectContext'->>'madeIn', ''),
  field = nullif(design->'projectContext'->>'field', ''),
  story_answers = design->'projectContext'->'answers'
where jsonb_typeof(design->'projectContext') = 'object'
  and made_in is null and field is null and story_answers is null;
end if;
end $context$;

alter table public.profiles add column if not exists show_journey boolean not null default false,
  add column if not exists then_now jsonb;
do $caption$
declare introduced boolean := not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='then_now_caption');
begin
  alter table public.projects add column if not exists then_now_caption text;
  if not exists (select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_then_now_caption_length') then
    alter table public.projects add constraint projects_then_now_caption_length check (then_now_caption is null or char_length(then_now_caption)<=180);
  end if;
  if introduced then
    update public.projects set then_now_caption=nullif(left(design->>'journeyCaption',180),'') where jsonb_typeof(design->'journeyCaption')='string';
  end if;
end $caption$;

-- The profile column is a public mirror. Keep unshared curation owner-only.
drop trigger if exists profiles_validate_journey_pair on public.profiles;
drop trigger if exists profiles_journey_10_store_pair on public.profiles;
drop trigger if exists profiles_journey_20_mirror_pair on public.profiles;
drop trigger if exists profiles_journey_insert_pair on public.profiles;
create table if not exists public.profile_journey_pairs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pair jsonb not null
);
alter table public.profile_journey_pairs enable row level security;
revoke all on public.profile_journey_pairs from public,anon,authenticated;
grant select on public.profile_journey_pairs to authenticated;
grant all on public.profile_journey_pairs to service_role;
drop policy if exists journey_pair_owner_read on public.profile_journey_pairs;
create policy journey_pair_owner_read on public.profile_journey_pairs for select to authenticated
using (exists (select 1 from public.profiles p where p.id=profile_id and p.account_id=(select auth.uid())));
-- One-time adoption also makes rerunning this prepared migration non-destructive.
insert into public.profile_journey_pairs(profile_id,pair)
  select id,then_now from public.profiles where then_now is not null
  on conflict(profile_id) do nothing;
update public.profiles p set then_now=case when show_journey then
  (select pair from public.profile_journey_pairs j where j.profile_id=p.id) else null end;

create or replace function public.validate_journey_pair() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare then_id uuid; now_id uuid; found_count integer;
begin
  if tg_op='INSERT' then
    if new.then_now is not null then raise exception 'Create the profile before choosing a Then/Now pair.' using errcode='23514'; end if;
    return new;
  end if;
  if new.then_now is null then
    delete from public.profile_journey_pairs where profile_id=new.id;
    return new;
  end if;
  if jsonb_typeof(new.then_now) is distinct from 'object'
    or not (new.then_now ?& array['then','now'])
    or (new.then_now - 'then' - 'now') <> '{}'::jsonb
    or jsonb_typeof(new.then_now->'then') is distinct from 'string'
    or jsonb_typeof(new.then_now->'now') is distinct from 'string' then
      raise exception 'Choose exactly two projects for Then/Now.' using errcode='23514';
  end if;
  begin
    then_id := (new.then_now->>'then')::uuid; now_id := (new.then_now->>'now')::uuid;
  exception when invalid_text_representation then
    raise exception 'Choose valid projects for Then/Now.' using errcode='23514';
  end;
  if then_id=now_id then raise exception 'Then and Now must be different projects.' using errcode='23514'; end if;
  perform p.id from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
    where p.id=any(array[then_id,now_id]) and p.profile_id=new.id and not p.is_hidden and not c.is_hidden
    order by p.id for share of p,c;
  get diagnostics found_count = row_count;
  if found_count<>2 then raise exception 'Choose two visible projects from your own portfolio.' using errcode='23514'; end if;
  new.then_now := jsonb_build_object('then',then_id::text,'now',now_id::text);

  insert into public.profile_journey_pairs(profile_id,pair) values(new.id,new.then_now)
    on conflict(profile_id) do update set pair=excluded.pair;
  if not new.show_journey then new.then_now:=null; end if;
  return new;
end $$;
revoke all on function public.validate_journey_pair() from public,anon,authenticated;
create trigger profiles_journey_10_store_pair before update of then_now on public.profiles
for each row execute function public.validate_journey_pair();
create trigger profiles_journey_insert_pair before insert on public.profiles
for each row execute function public.validate_journey_pair();

create or replace function public.mirror_journey_pair() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  new.then_now:=case when new.show_journey then
    (select pair from public.profile_journey_pairs where profile_id=new.id) else null end;
  return new;
end $$;
revoke all on function public.mirror_journey_pair() from public,anon,authenticated;
create trigger profiles_journey_20_mirror_pair before update of show_journey on public.profiles
for each row execute function public.mirror_journey_pair();

create or replace function public.clear_project_journey_pair() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if tg_op='DELETE' or new.is_hidden or new.category_id is distinct from old.category_id
    or new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    update public.profiles u set then_now=null where exists (select 1 from public.profile_journey_pairs j
      where j.profile_id=u.id and (j.pair->>'then'=old.id::text or j.pair->>'now'=old.id::text));
  end if;
  return null;
end $$;
revoke all on function public.clear_project_journey_pair() from public;
drop trigger if exists projects_clear_journey_pair on public.projects;
create trigger projects_clear_journey_pair after update of is_hidden,category_id,profile_id,id or delete on public.projects
for each row execute function public.clear_project_journey_pair();

create or replace function public.clear_category_journey_pair() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.is_hidden or new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    update public.profiles u set then_now=null where exists (select 1 from public.projects p
      join public.profile_journey_pairs j on j.profile_id=u.id where p.category_id=old.id
      and (j.pair->>'then'=p.id::text or j.pair->>'now'=p.id::text));
  end if;
  return null;
end $$;
revoke all on function public.clear_category_journey_pair() from public;
drop trigger if exists categories_clear_journey_pair on public.portfolio_categories;
create trigger categories_clear_journey_pair after update of is_hidden,profile_id,id on public.portfolio_categories
for each row execute function public.clear_category_journey_pair();
-- Keep public gating/captions consistent in the same transaction.
-- Optional cover/context columns use to_jsonb, so no cover migration is required here.
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
      'show_journey',coalesce((to_jsonb(u)->>'show_journey')::boolean,false),
      'then_now',case when to_jsonb(u)->>'show_journey'='true'
        and exists (select 1 from visible_projects p where p.id::text=to_jsonb(u)->'then_now'->>'then')
        and exists (select 1 from visible_projects p where p.id::text=to_jsonb(u)->'then_now'->>'now')
        then to_jsonb(u)->'then_now' else null end,
      'portfolio_headline',to_jsonb(u)->'portfolio_headline','school',to_jsonb(u)->'school','availability',to_jsonb(u)->'availability',
      'contact_email_public',coalesce((to_jsonb(u)->>'contact_email_public')::boolean,false),
      'contact_email',case when to_jsonb(u)->>'contact_email_public'='true' then to_jsonb(u)->'contact_email' else null end,
      'allow_pdf_download',coalesce((to_jsonb(u)->>'allow_pdf_download')::boolean,true),
      'start_here_project_id',case when exists (select 1 from visible_projects p where p.id::text=to_jsonb(u)->>'start_here_project_id') then to_jsonb(u)->'start_here_project_id' else null end,
      'public_appearance',u.public_appearance,'project_grid_columns',u.project_grid_columns),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'profile_id',c.profile_id,
      'label',c.label,'icon_name',c.icon_name,'format',c.format,'blurb',c.blurb,'position',c.position,'is_hidden',false)
      order by c.position,c.id) from visible_categories c),'[]'::jsonb),
    'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'profile_id',p.profile_id,'category_id',p.category_id,
      'title',p.title,'summary',p.summary,'design',p.design,'position',p.position,'is_hidden',false,'is_pinned',p.is_pinned,
      'made_in',to_jsonb(p)->'made_in','field',to_jsonb(p)->'field','story_answers',to_jsonb(p)->'story_answers',
      'published_at',p.published_at,'revision',p.revision,'cover_thumbnail',to_jsonb(p)->'cover_thumbnail',
      'topic_keys',p.topic_keys,'content_location',p.content_location,'geographic_scope',p.geographic_scope,
      'geography_confidence',p.geography_confidence,
      'kind',(select a.kind from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),
      'page_count',coalesce((select case when a.kind='document' and a.metadata->>'pageCount' ~ '^[0-9]{1,9}$'
        then (a.metadata->>'pageCount')::integer else 0 end from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),0))
      || case when to_jsonb(p) ? 'then_now_caption' then jsonb_build_object('then_now_caption',to_jsonb(p)->'then_now_caption') else '{}'::jsonb end
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
