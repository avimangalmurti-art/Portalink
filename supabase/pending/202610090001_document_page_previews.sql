-- PENDING REVIEW; separate Storage approval required. Do not apply automatically.
-- Extends the existing public-cover guard; no bucket creation/public-policy change.
-- Apply only after production-catalog review, then deploy dependent app.
-- Private/draft work stays on private originals; public caches cannot be recalled.
begin;
create or replace function public.project_cover_write_allowed(object_name text)
returns boolean language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare owner_id uuid; hidden_project boolean; hidden_category boolean; private_profile boolean;
begin
  if object_name is null or object_name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/([a-f0-9]{64}/(200|400|800|social)|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[1-9][0-9]{0,3}-[a-f0-9]{64}-(800|1600))\.webp$' then return false; end if;
  select u.account_id,p.is_hidden,c.is_hidden,u.is_private into owner_id,hidden_project,hidden_category,private_profile
  from public.projects p join public.profiles u on u.id=p.profile_id
  join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
  where p.id=public.storage_path_uuid(object_name,2) and p.profile_id=public.storage_path_uuid(object_name,1)
  and (split_part(object_name,'/',3) ~ '^[a-f0-9]{64}$' or exists(select 1 from public.project_attachments a where a.project_id=p.id and a.kind='document' and a.citation_id::text=split_part(object_name,'/',3)))
  for share of u,c,p;
  return coalesce(found and not hidden_project and not hidden_category and not private_profile
    and (current_user='service_role' or owner_id=(select auth.uid())),false);
end;
$$;
revoke all on function public.project_cover_write_allowed(text) from public,anon;
grant execute on function public.project_cover_write_allowed(text) to authenticated,service_role;

create function public.document_page_prerender_enabled() returns boolean
language sql stable as $$ select true $$;
revoke all on function public.document_page_prerender_enabled() from public;
grant execute on function public.document_page_prerender_enabled() to authenticated,service_role;

create function public.set_document_page_previews(p_attachment_id text,p_page_count integer,p_pages jsonb,p_failed jsonb,p_backfill_from integer default null)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare a public.project_attachments%rowtype; work public.projects%rowtype;
 page jsonb; variant jsonb; output jsonb:='[]'; prefix text; n integer; w integer; h integer;
 seen integer[]:='{}'; sizes integer[]; large jsonb; small jsonb;
begin
 select * into a from public.project_attachments where id=p_attachment_id for update;
 if not found or a.kind<>'document' then raise exception 'Document unavailable'; end if;
 select * into work from public.projects where id=a.project_id for share;
 if not public.owns_profile(work.profile_id) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Not owner' using errcode='42501'; end if;
 if not public.is_citation_project_public(work.id) then raise exception 'Public document required'; end if;
 -- Serialization with privacy transitions matches the existing cover guard.
 perform 1 from public.profiles where id=work.profile_id for share;
 perform 1 from public.portfolio_categories where id=work.category_id for share;
 if p_page_count is null or p_page_count not between 1 and 5000
   or jsonb_typeof(p_pages) is distinct from 'array' or jsonb_typeof(p_failed) is distinct from 'array'
   or jsonb_array_length(p_pages)>p_page_count
   or (p_backfill_from is not null and p_backfill_from not between 1 and p_page_count) then raise exception 'Invalid pages'; end if;
 if coalesce(a.metadata->>'pageCount','') ~ '^[0-9]{1,9}$'
   and (a.metadata->>'pageCount')::integer between 1 and 5000
   and p_page_count<>public.attachment_page_count(a.metadata) then raise exception 'Page count mismatch'; end if;
 prefix:=work.profile_id::text||'/'||work.id::text||'/'||a.citation_id::text||'/';
 for page in select value from jsonb_array_elements(p_pages) loop
   if coalesce(page->>'number','') !~ '^[0-9]{1,4}$' then raise exception 'Invalid page'; end if;
   n:=(page->>'number')::integer;
   if n not between 1 and p_page_count or n=any(seen) or jsonb_typeof(page->'variants') is distinct from 'array' or jsonb_array_length(page->'variants')<>2 then raise exception 'Invalid page'; end if;
   seen:=array_append(seen,n); sizes:='{}'; large:=null; small:=null;
   for variant in select value from jsonb_array_elements(page->'variants') loop
     if coalesce(variant->>'size','') not in ('800','1600') or (variant->>'size')::integer=any(sizes)
       or coalesce(variant->>'width','') !~ '^[0-9]{1,4}$' or coalesce(variant->>'height','') !~ '^[0-9]{1,4}$'
       or coalesce(variant->>'storagePath','') !~ ('^'||prefix||n::text||'-[a-f0-9]{64}-'||(variant->>'size')||'\.webp$')
     then raise exception 'Invalid variant'; end if;
     w:=(variant->>'width')::integer; h:=(variant->>'height')::integer;
     if w not between 1 and (variant->>'size')::integer or h not between 1 and (variant->>'size')::integer
       or not exists(select 1 from storage.objects where bucket_id='project-covers' and name=variant->>'storagePath') then raise exception 'Missing variant'; end if;
     sizes:=array_append(sizes,(variant->>'size')::integer);
     if variant->>'size'='1600' then large:=variant; else small:=variant; end if;
   end loop;
   output:=output||jsonb_build_array(jsonb_build_object('index',n,'withinDocumentIndex',n,'attachmentId',a.id,
     'storagePath',large->>'storagePath','previewStoragePath',small->>'storagePath','bucket','project-covers',
     'width',(large->>'width')::integer,'height',(large->>'height')::integer,
     'aspectRatio',(large->>'width')::numeric/(large->>'height')::numeric));
 end loop;
 for page in select value from jsonb_array_elements(p_failed) loop
   if page::text !~ '^[0-9]{1,4}$' then raise exception 'Invalid failed page'; end if;
   n:=page::text::integer;
   if n not between 1 and p_page_count or n=any(seen) then raise exception 'Invalid failed page'; end if;
   seen:=array_append(seen,n);
 end loop;
 if cardinality(seen)<>coalesce(p_backfill_from-1,p_page_count) or exists(select 1 from unnest(seen) as entries(page_number) where entries.page_number>=coalesce(p_backfill_from,p_page_count+1)) then raise exception 'Unflagged page gap'; end if;
 update public.project_attachments set metadata=coalesce(metadata,'{}')||jsonb_build_object('pageCount',p_page_count,'renderedPages',output,
   'pageRenderFailures',p_failed,'pageBackfillFrom',p_backfill_from) where id=a.id;
end $$;
revoke all on function public.set_document_page_previews(text,integer,jsonb,jsonb,integer) from public,anon;
grant execute on function public.set_document_page_previews(text,integer,jsonb,jsonb,integer) to authenticated,service_role;
commit;
