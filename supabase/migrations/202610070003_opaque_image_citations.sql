-- PENDING REVIEW. Do not apply or move until creator review.
-- Rollout: applied 0001, applied 0002, approve/apply 0003, then deploy dependent app.
-- No Storage policies, objects, worker deployments or D1 changes.
begin;
-- Live catalog confirmed existing notification kinds; add citation without removing any.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in ('message','reply','follow','system','citation'));
-- Citation removal (including a citing-project cascade) removes its notification.
alter table public.notifications drop constraint notifications_citation_id_fkey;
alter table public.notifications add constraint notifications_citation_id_fkey
foreign key (citation_id) references public.citations(id) on delete cascade;
alter table public.project_attachments add column citation_id uuid not null default gen_random_uuid() unique;
-- PostgreSQL fills existing rows with distinct UUID defaults; attachment/storage IDs remain unchanged.
-- Do not run ordinary insert validation while translating existing persisted references.

update public.citations c set cited_item_id=a.citation_id::text
from public.project_attachments a where a.kind='image' and c.cited_item_id=a.id;

create or replace function public.citation_target(p_item_id text)
returns table (project_id uuid, creator_id uuid, label text)
language sql stable security definer set search_path=public as $$
  select a.project_id,p.profile_id,'image ' ||
    (select count(*) from public.project_attachments other where other.project_id=a.project_id
      and other.kind='image' and (other.position,other.id)<=(a.position,a.id))::text
  from public.project_attachments a join public.projects p on p.id=a.project_id
  where a.citation_id::text=p_item_id and a.kind='image'
  union all
  select a.project_id,p.profile_id,'page ' || page.source_page_number::text
  from public.project_pages page join public.project_attachments a on a.id=page.attachment_id
  join public.projects p on p.id=a.project_id
  where page.id::text=p_item_id and a.kind='document'
    and page.source_page_number<=public.attachment_page_count(a.metadata);
$$;
create or replace function public.resolve_citation_item(p_item_id text, p_require_citable boolean default false)
returns jsonb language sql stable security definer set search_path=public as $$
  with target as (
    select a.id,a.project_id,a.kind,a.position,a.storage_path,a.metadata,null::integer as page_number
      from public.project_attachments a where a.citation_id::text=p_item_id and a.kind='image'
    union all
    select a.id,a.project_id,a.kind,a.position,a.storage_path,a.metadata,page.source_page_number
      from public.project_pages page join public.project_attachments a on a.id=page.attachment_id
      where page.id::text=p_item_id and a.kind='document'
        and page.source_page_number<=public.attachment_page_count(a.metadata)
  )
  select jsonb_build_object('id',p_item_id,'attachmentId',t.id,'projectId',p.id,
    'creatorId',creator.id,'creator',creator.name,'projectTitle',p.title,
    'madeOn',p.made_on,'citable',p.citation_permitted,
    'kind',case when t.kind='image' then 'image' else 'page' end,
    'number',coalesce(t.page_number,(select count(*) from public.project_attachments other
      where other.project_id=p.id and other.kind='image' and (other.position,other.id)<=(t.position,t.id))),
    'documentStoragePath',case when t.page_number is not null then t.storage_path end,
    'storagePath',case when t.page_number is null then t.storage_path else
      (select page->>'storagePath' from jsonb_array_elements(case when jsonb_typeof(t.metadata->'renderedPages')='array' then t.metadata->'renderedPages' else '[]'::jsonb end) page
        where page->>'withinDocumentIndex'=t.page_number::text limit 1) end)
  from target t join public.projects p on p.id=t.project_id
    join public.profiles creator on creator.id=p.profile_id
    join public.portfolio_categories portal on portal.id=p.category_id
  where not p.is_hidden and not creator.is_private and not portal.is_hidden
    and (not p_require_citable or p.citation_permitted);
$$;
create or replace function public.cleanup_deleted_citation_item() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='project_attachments' then
   delete from public.citations where cited_item_id=old.citation_id::text;
 else
   delete from public.citations where cited_item_id=old.id::text;
 end if;
 return old;
end $$;
create function public.guard_attachment_citation_identity() returns trigger
language plpgsql set search_path=public as $$
begin if new.citation_id is distinct from old.citation_id then raise exception 'citation identity is immutable'; end if; return new; end $$;
revoke all on function public.guard_attachment_citation_identity() from public,anon,authenticated;
create trigger attachments_citation_identity_immutable before update of citation_id on public.project_attachments
for each row execute function public.guard_attachment_citation_identity();
drop view public.citable_images;
create view public.citable_images with (security_invoker=true) as
select a.citation_id,a.project_id,a.position,a.storage_path,a.metadata
from public.project_attachments a where a.kind='image' and public.is_project_citable(a.project_id);
grant select on public.citable_images to anon,authenticated;
create function public.resolve_public_image_id(p_attachment_id text) returns text
language sql stable security definer set search_path=public as $$
select a.citation_id::text from public.project_attachments a
where a.id=p_attachment_id and a.kind='image' and public.is_citation_project_public(a.project_id);
$$;
revoke all on function public.resolve_public_image_id(text) from public;
grant execute on function public.resolve_public_image_id(text) to anon,authenticated;
-- Atomic creation access/date: no public interval for a private new project.
create function public.publish_project_citation_fields(
 p_draft_id uuid,p_profile_id uuid,p_category_id uuid,p_title text,p_summary text,p_attachments jsonb,
 p_topic_keys text[],p_content_location text,p_geographic_scope text,p_geography_confidence real,
 p_made_on date,p_access_level text
) returns uuid language plpgsql security invoker set search_path=public as $$
declare project_id uuid;
begin
 if p_access_level not in ('private','public','citable') or p_access_level is null then raise exception 'invalid access'; end if;
 project_id:=public.publish_project(p_draft_id,p_profile_id,p_category_id,p_title,p_summary,p_attachments,
 p_topic_keys,p_content_location,p_geographic_scope,p_geography_confidence);
 update public.projects set is_hidden=(p_access_level='private'),citation_permitted=(p_access_level='citable'),
 made_on=coalesce(p_made_on,made_on) where id=project_id and profile_id=p_profile_id;
 return project_id;
end $$;
revoke all on function public.publish_project_citation_fields(uuid,uuid,uuid,text,text,jsonb,text[],text,text,real,date,text) from public,anon;
grant execute on function public.publish_project_citation_fields(uuid,uuid,uuid,text,text,jsonb,text[],text,text,real,date,text) to authenticated;
commit;
