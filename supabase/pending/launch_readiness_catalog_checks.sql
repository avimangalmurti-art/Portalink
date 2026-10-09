-- READ ONLY EVIDENCE QUERIES; not a migration. Save output after approval.
begin read only;
select current_setting('max_connections') as database_connection_limit;
select application_name,state,count(*) from pg_stat_activity
where datname=current_database() group by application_name,state order by count(*) desc;
select p.title,a.citation_id,public.attachment_page_count(a.metadata) as page_count,
 case when jsonb_typeof(a.metadata->'renderedPages')='array' then jsonb_array_length(a.metadata->'renderedPages') else 0 end as rendered_pages,
 a.metadata->'pageRenderFailures' as failed_pages,a.metadata->'pageBackfillFrom' as backfill_from
from public.project_attachments a join public.projects p on p.id=a.project_id
where a.kind='document' order by p.title,a.position;
explain(analyze,buffers,format json)
select public.resolve_citation_item('9ae4b24a-446d-41b8-b3a9-1a035ed14fc7',false);
explain(analyze,buffers,format json)
select public.resolve_citation_item('1b5e9529-f180-4632-a9fd-c87428472e5a',false);
-- Function EXPLAIN does not expose security-definer internal plan nodes;
-- also collect the actual indexed identity lookups.
explain(analyze,buffers,format json)
select project_id from public.project_attachments
where citation_id='9ae4b24a-446d-41b8-b3a9-1a035ed14fc7';
explain(analyze,buffers,format json)
select attachment_id,page_number from public.project_pages
where id='1b5e9529-f180-4632-a9fd-c87428472e5a';
rollback;
