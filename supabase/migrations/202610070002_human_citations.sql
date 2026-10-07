-- Rollout: apply 202610070001, apply 202610070002, then deploy the app.
-- Never publish a dependent app build before BOTH migrations are applied.
-- PENDING REVIEW ONLY. Requires reviewed Part 1 proposal first.
-- Do NOT apply, publish, or run against production. No Storage/D1 changes.
begin;

-- Resolve a stable attachment ID (image) or page UUID (document) privately.
-- Kept internal: browser callers cannot enumerate hidden targets with this helper.
create function public.citation_target(p_item_id text)
returns table (project_id uuid, creator_id uuid, label text)
language sql stable security definer set search_path=public as $$
  select a.project_id,p.profile_id,'image ' ||
    (select count(*) from public.project_attachments other where other.project_id=a.project_id
      and other.kind='image' and (other.position,other.id)<=(a.position,a.id))::text
  from public.project_attachments a join public.projects p on p.id=a.project_id
  where a.id=p_item_id and a.kind='image'
  union all
  select a.project_id,p.profile_id,'page ' || page.source_page_number::text
  from public.project_pages page join public.project_attachments a on a.id=page.attachment_id
  join public.projects p on p.id=a.project_id
  where page.id::text=p_item_id and a.kind='document'
    and page.source_page_number<=public.attachment_page_count(a.metadata);
$$;
revoke all on function public.citation_target(text) from public,anon,authenticated;

create function public.is_citation_item_public(p_item_id text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.citation_target(p_item_id) target
    join public.projects p on p.id=target.project_id
    join public.profiles creator on creator.id=p.profile_id
    join public.portfolio_categories portal on portal.id=p.category_id
    where not p.is_hidden and not creator.is_private and not portal.is_hidden);
$$;
revoke all on function public.is_citation_item_public(text) from public;
grant execute on function public.is_citation_item_public(text) to anon,authenticated;

create function public.is_citation_project_public(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.projects p
 join public.profiles u on u.id=p.profile_id
 join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
 where p.id=p_id and not p.is_hidden and not u.is_private and not c.is_hidden);
$$;
revoke all on function public.is_citation_project_public(uuid) from public;
grant execute on function public.is_citation_project_public(uuid) to anon,authenticated;

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  citing_project_id uuid not null references public.projects(id) on delete cascade,
  cited_item_id text not null,
  -- Persist target creator so private/deleted items do not lose creator-only scope.
  cited_creator_id uuid not null references public.profiles(id) on delete cascade,
  citing_creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text check (char_length(note)<=140),
  source text not null default 'app' check (source in ('app','external')),
  unique (citing_project_id,cited_item_id),
  check (citing_creator_id<>cited_creator_id)
);
create index citations_item_created_idx on public.citations(cited_item_id,created_at desc,id);
create index citations_creator_created_idx on public.citations(citing_creator_id,created_at desc,id);
create index citations_cited_creator_created_idx on public.citations(cited_creator_id,created_at desc,id);
alter table public.citations enable row level security;

-- Definer establishes identity from canonical rows; clients cannot spoof either
-- creator. Public is sufficient for HUMAN citations, not AI citable opt-in.
create function public.validate_citation_insert() returns trigger
language plpgsql security definer set search_path=public as $$
declare target record; project_creator uuid;
begin
  select * into target from public.citation_target(new.cited_item_id);
  select profile_id into project_creator from public.projects where id=new.citing_project_id;
  if target.project_id is null or project_creator is null then
    raise exception 'citation unavailable';
  end if;
  if not public.owns_profile(project_creator) or new.source<>'app' then
    raise exception 'citation unavailable';
  end if;
  if project_creator=target.creator_id or not public.is_citation_item_public(new.cited_item_id) then
    raise exception 'citation unavailable';
  end if;
  new.citing_creator_id:=project_creator;
  new.cited_creator_id:=target.creator_id;
  new.created_at:=now();
  return new;
end $$;
revoke all on function public.validate_citation_insert() from public,anon,authenticated;
create trigger citations_validate_insert before insert on public.citations
for each row execute function public.validate_citation_insert();

create policy citations_read on public.citations for select to anon,authenticated using (
  (public.is_citation_item_public(cited_item_id) and public.is_citation_project_public(citing_project_id))
  or public.owns_profile(citing_creator_id) or public.owns_profile(cited_creator_id)
);
create policy citations_insert on public.citations for insert to authenticated with check (
  source='app' and public.owns_profile(citing_creator_id)
  and exists (select 1 from public.projects p where p.id=citing_project_id
    and p.profile_id=citing_creator_id and public.owns_profile(p.profile_id))
  and public.is_citation_item_public(cited_item_id) and citing_creator_id<>cited_creator_id
);
create policy citations_delete on public.citations for delete to authenticated using (
  public.owns_profile(citing_creator_id)
);
-- A note is entered AFTER the project pick; permit only note updates, not moving
-- a citation or changing either creator, source, timestamp or stable target.
create policy citations_note_update on public.citations for update to authenticated
using (public.owns_profile(citing_creator_id)) with check (public.owns_profile(citing_creator_id));
revoke all on public.citations from anon,authenticated;
grant select on public.citations to anon,authenticated;
grant insert,delete on public.citations to authenticated;
grant update(note) on public.citations to authenticated;
revoke update on public.citations from anon;

-- Live read-only REST column projection on 2026-10-07 confirmed kind,
-- target_path and actor_profile_id exist. Direct catalog/OpenAPI was denied
-- (401); idempotent additions also cover deployments missing these fields.
-- Idempotent column additions: notification schemas differ across deployments.
-- Existing /p/<profile UUID>/c/<category UUID>/<project UUID> is a registered
-- app route (src/app/routes.ts); it opens the canonical project, not a draft.
alter table public.notifications
 add column if not exists kind text not null default 'system',
 add column if not exists target_path text,
 add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null,
 add column citation_id uuid unique references public.citations(id) on delete set null;
create function public.notify_visible_citation(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare citation public.citations; recipient uuid; actor text; cited_title text;
 citing_title text; target_label text; destination text;
begin
 select * into citation from public.citations where id=p_id;
 if not found or not public.is_citation_project_public(citation.citing_project_id)
   or not public.is_citation_item_public(citation.cited_item_id) then return; end if;
 select account_id into recipient from public.profiles where id=citation.cited_creator_id;
 select name into actor from public.profiles where id=citation.citing_creator_id;
 select p.title,t.label into cited_title,target_label
 from public.citation_target(citation.cited_item_id) t join public.projects p on p.id=t.project_id;
 select title,'/p/'||profile_id::text||'/c/'||category_id::text||'/'||id::text
 into citing_title,destination from public.projects where id=citation.citing_project_id;
 insert into public.notifications(account_id,body,kind,citation_id,target_path,actor_profile_id)
 values(recipient,actor||' cited '||target_label||' of '||cited_title||' in "'||citing_title||'".',
 'citation',citation.id,destination,citation.citing_creator_id)
 on conflict(citation_id) do nothing;
end $$;
revoke all on function public.notify_visible_citation(uuid) from public,anon,authenticated;
create function public.notify_citation_insert() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.notify_visible_citation(new.id); return new; end $$;
revoke all on function public.notify_citation_insert() from public,anon,authenticated;
create trigger citations_notify_insert after insert on public.citations
for each row execute function public.notify_citation_insert();
create function public.notify_published_citations() returns trigger
language plpgsql security definer set search_path=public as $$
declare citation_id uuid;
begin
 if old.is_hidden and not new.is_hidden then
  for citation_id in select id from public.citations where citing_project_id=new.id loop
   perform public.notify_visible_citation(citation_id);
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.notify_published_citations() from public,anon,authenticated;
create trigger projects_notify_published_citations after update of is_hidden on public.projects
for each row execute function public.notify_published_citations();
create function public.cleanup_deleted_citation_item() returns trigger
language plpgsql security definer set search_path=public as $$
begin delete from public.citations where cited_item_id=old.id::text; return old; end $$;
revoke all on function public.cleanup_deleted_citation_item() from public,anon,authenticated;
create trigger attachments_cleanup_citations after delete on public.project_attachments
for each row execute function public.cleanup_deleted_citation_item();
create trigger pages_cleanup_citations after delete on public.project_pages
for each row execute function public.cleanup_deleted_citation_item();
-- Public counts never include drafts, even when the caller is one of the creators.
create function public.public_cited_in(p_item_id text) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'created_at',c.created_at,
 'project',jsonb_build_object('id',p.id,'title',p.title,'creator',u.name,
 'profileId',u.id,'categoryId',p.category_id)) order by c.created_at desc,c.id),'[]'::jsonb)
 from public.citations c join public.projects p on p.id=c.citing_project_id
 join public.profiles u on u.id=p.profile_id where c.cited_item_id=p_item_id
 and public.is_citation_item_public(c.cited_item_id) and public.is_citation_project_public(p.id);
$$;
revoke all on function public.public_cited_in(text) from public;
grant execute on function public.public_cited_in(text) to anon,authenticated;

alter table public.profiles
  add column show_outgoing_citations boolean not null default true,
  add column show_incoming_citations boolean not null default true;
alter table public.profiles alter column show_journey set default true;
-- Existing show_journey values are deliberately preserved.
-- These are Journey presentation preferences, not access-policy overrides.
-- Narrow public Journey projection; owner-only exceptions never widen it.
create function public.public_profile_citations(p_profile_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,
 'direction',case when c.citing_creator_id=$1 then 'outgoing' else 'incoming' end,
 'item_id',c.cited_item_id,'label',t.label,
 'other_creator_name',other.name,'other_creator_handle',other.handle,
 'other_project_id',op.id,'other_project_title',op.title,
 'other_profile_id',other.id,'other_category_id',op.category_id,
 'citing_project_title',cp.title,'created_at',c.created_at,'note',c.note)
 order by c.created_at desc,c.id),'[]'::jsonb)
 from public.citations c cross join lateral public.citation_target(c.cited_item_id) t
 join public.projects cp on cp.id=c.citing_project_id
 join public.projects target on target.id=t.project_id
 join public.profiles viewer on viewer.id=$1
 join public.profiles other on other.id=case when c.citing_creator_id=$1 then c.cited_creator_id else c.citing_creator_id end
 join public.projects op on op.id=case when c.citing_creator_id=$1 then target.id else cp.id end
 where not viewer.is_private and viewer.show_journey
 and ((c.citing_creator_id=$1 and viewer.show_outgoing_citations)
 or (c.cited_creator_id=$1 and viewer.show_incoming_citations))
 and public.is_citation_item_public(c.cited_item_id)
 and public.is_citation_project_public(cp.id);
$$;
revoke all on function public.public_profile_citations(uuid) from public;
grant execute on function public.public_profile_citations(uuid) to anon,authenticated;

-- Keep the public bundle's existing narrow projections and cover-only pipeline.
-- Compare with the live function definition before applying this replacement.
do $upgrade$ begin
 if to_regprocedure('public.shared_profile_bundle(uuid)') is not null then
 execute $bundle$create or replace function public.shared_profile_bundle(profile_id uuid)
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
      'show_outgoing_citations',coalesce((to_jsonb(u)->>'show_outgoing_citations')::boolean,true),
      'show_incoming_citations',coalesce((to_jsonb(u)->>'show_incoming_citations')::boolean,true),
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
      'made_on',p.made_on,'citation_permitted',p.citation_permitted,
      'published_at',p.published_at,'revision',p.revision,'cover_thumbnail',to_jsonb(p)->'cover_thumbnail',
      'topic_keys',p.topic_keys,'content_location',p.content_location,'geographic_scope',p.geographic_scope,
      'geography_confidence',p.geography_confidence,
      'kind',(select a.kind from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),
      'page_count',coalesce((select case when a.kind='document'
        then public.attachment_page_count(a.metadata) else 0 end from cover_rows a where a.project_id=p.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),0))
      || case when to_jsonb(p) ? 'then_now_caption' then jsonb_build_object('then_now_caption',to_jsonb(p)->'then_now_caption') else '{}'::jsonb end
      order by p.made_on desc,p.published_at desc,p.id) from visible_projects p),'[]'::jsonb),
    'citations',public.public_profile_citations($1),
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
$bundle$;
 end if;
end $upgrade$;
commit;
