-- PREPARED ONLY. Apply only after explicit approval, as one transaction.
-- Existing profiles.headline is the long Bio; preserve it. The new short field
-- uses portfolio_headline. NULL falls back to Bio; '' deliberately hides it.
begin;
alter table public.profiles
  add column if not exists portfolio_headline text,
  add column if not exists school text,
  add column if not exists availability text,
  add column if not exists contact_email_public boolean not null default false,
  add column if not exists contact_email text,
  add column if not exists allow_pdf_download boolean not null default true,
  add column if not exists start_here_project_id uuid;
do $constraints$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_employer_text_lengths') then
    alter table public.profiles add constraint profiles_employer_text_lengths check (
      (portfolio_headline is null or char_length(portfolio_headline)<=80)
      and (school is null or char_length(school)<=120)
      and (availability is null or char_length(availability)<=120));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_public_contact_opt_in') then
    alter table public.profiles add constraint profiles_public_contact_opt_in check (
      (not contact_email_public and contact_email is null) or
      (contact_email_public and contact_email is not null and char_length(contact_email) between 3 and 254
       and contact_email=btrim(contact_email)
       and contact_email ~ '^[^[:space:]<>@,;?&#]+@[^[:space:]<>@,;?&#]+[.][^[:space:]<>@,;?&#]+$'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_start_here_project_fkey') then
    alter table public.profiles add constraint profiles_start_here_project_fkey foreign key (start_here_project_id) references public.projects(id) on delete set null;
  end if;
end $constraints$;

-- Public profile RLS is row-level: never store an undisclosed address here.
-- No auth.users access and no migration from account email or legacy JSON.
create or replace function public.normalize_portfolio_contact() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  new.contact_email := case when new.contact_email_public then nullif(btrim(new.contact_email),'') else null end;
  return new;
end $$;
revoke all on function public.normalize_portfolio_contact() from public;
drop trigger if exists profiles_normalize_portfolio_contact on public.profiles;
create trigger profiles_normalize_portfolio_contact before insert or update of contact_email_public,contact_email on public.profiles
for each row execute function public.normalize_portfolio_contact();

create or replace function public.validate_start_here_project() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if new.start_here_project_id is null then return new; end if;
  perform p.id from public.projects p join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
    where p.id=new.start_here_project_id and p.profile_id=new.id and not p.is_hidden and not c.is_hidden for share of p,c;
  if not found then raise exception 'Choose a public project from your own portfolio.' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.validate_start_here_project() from public;
drop trigger if exists profiles_validate_start_here_project on public.profiles;
create trigger profiles_validate_start_here_project before insert or update of start_here_project_id,id on public.profiles
for each row execute function public.validate_start_here_project();

create or replace function public.clear_project_start_here() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.is_hidden or new.category_id is distinct from old.category_id or new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    update public.profiles set start_here_project_id=null where start_here_project_id=old.id;
  end if;
  return null;
end $$;
revoke all on function public.clear_project_start_here() from public;
drop trigger if exists projects_clear_start_here on public.projects;
create trigger projects_clear_start_here after update of is_hidden,category_id,profile_id,id on public.projects
for each row execute function public.clear_project_start_here();
create or replace function public.clear_category_start_here() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.is_hidden or new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    update public.profiles u set start_here_project_id=null where exists (select 1 from public.projects p where p.category_id=old.id and u.start_here_project_id=p.id);
  end if;
  return null;
end $$;
revoke all on function public.clear_category_start_here() from public;
drop trigger if exists categories_clear_start_here on public.portfolio_categories;
create trigger categories_clear_start_here after update of is_hidden,profile_id,id on public.portfolio_categories
for each row execute function public.clear_category_start_here();

-- Updated public bundle is appended here so an older RPC cannot omit an opt-out.
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
