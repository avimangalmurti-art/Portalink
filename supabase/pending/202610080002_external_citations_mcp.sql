-- PENDING REVIEW / NOT APPLIED. Requires applied citation migrations 0001-0003.
-- Approve/apply this SQL, configure server-only MCP_SERVER_KEY and MCP_IP_SALT,
-- then deploy reviewed app. Never expose these secrets in VITE_* or client code.
-- No Storage policy/object change; public covers and existing anonymous signing only.
-- External events are usage receipts, never content edits. No raw IP is retained.
begin;
alter table public.citations alter column citing_project_id drop not null;
alter table public.citations alter column citing_creator_id drop not null;
alter table public.citations add column context text check (char_length(context)<=140);
alter table public.citations add constraint citations_source_shape check (
 (source='app' and citing_project_id is not null and citing_creator_id is not null and context is null)
 or (source='external' and citing_project_id is null and citing_creator_id is null and note is null));

-- Reuse the existing hashed-event/advisory-lock throttling pattern. Rolling minute.
create table public.mcp_request_events (ip_hash text not null, at timestamptz not null default now());
create index mcp_request_events_hash_at on public.mcp_request_events(ip_hash,at);
create index mcp_request_events_at on public.mcp_request_events(at);
create table public.external_citation_dedupe (
 ip_hash text not null, item_id text not null,
 citation_id uuid not null references public.citations(id) on delete cascade,
 at timestamptz not null default now(), primary key(ip_hash,item_id));
alter table public.mcp_request_events enable row level security;
alter table public.external_citation_dedupe enable row level security;
revoke all on public.mcp_request_events,public.external_citation_dedupe from public,anon,authenticated;
create function public.mcp_allow_request(p_ip_hash text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_ip_hash !~ '^[0-9a-f]{64}$' or p_ip_hash is null then raise exception 'invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('mcp-rate:'||p_ip_hash,0));
 delete from public.mcp_request_events where at<=now()-interval '1 minute';
 if (select count(*) from public.mcp_request_events where ip_hash=p_ip_hash)>=60 then return false; end if;
 insert into public.mcp_request_events(ip_hash) values(p_ip_hash); return true;
end $$;
revoke all on function public.mcp_allow_request(text) from public,anon,authenticated;
grant execute on function public.mcp_allow_request(text) to service_role;

create or replace function public.validate_citation_insert() returns trigger
language plpgsql security definer set search_path=public as $$
declare target record; project_creator uuid;
begin
 select * into target from public.citation_target(new.cited_item_id);
 if new.source='external' then
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then
   raise exception 'citation unavailable';
  end if;
  if target.project_id is null or not public.is_project_citable(target.project_id)
    or new.citing_project_id is not null or new.citing_creator_id is not null then
   raise exception 'citation unavailable'; end if;
  new.cited_creator_id:=target.creator_id;new.created_at:=now();return new;
 end if;
 select profile_id into project_creator from public.projects where id=new.citing_project_id;
 if target.project_id is null or project_creator is null then raise exception 'citation unavailable'; end if;
 if not public.owns_profile(project_creator) or new.source<>'app' then raise exception 'citation unavailable'; end if;
 if project_creator=target.creator_id or not public.is_citation_item_public(new.cited_item_id) then raise exception 'citation unavailable'; end if;
 new.citing_creator_id:=project_creator;new.cited_creator_id:=target.creator_id;new.created_at:=now();return new;
end $$;
-- Existing app insert/delete/note RLS remains; null citing creator never owns an event.
drop policy citations_read on public.citations;
create policy citations_read on public.citations for select to anon,authenticated using (
 (public.is_citation_item_public(cited_item_id)
  and (source='external' or public.is_citation_project_public(citing_project_id)))
 or public.owns_profile(citing_creator_id) or public.owns_profile(cited_creator_id));

create function public.record_external_citation(p_item_id text,p_ip_hash text,p_context text default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare target record; previous public.external_citation_dedupe; event_id uuid;
begin
 if p_ip_hash !~ '^[0-9a-f]{64}$' or p_ip_hash is null or char_length(p_context)>140 then raise exception 'invalid request'; end if;
 select * into target from public.citation_target(p_item_id);
 if target.project_id is null then raise exception 'citation unavailable'; end if;
 -- Lock canonical visibility parents until commit; privacy/opt-out changes serialize.
 perform p.id from public.projects p join public.profiles u on u.id=p.profile_id
 join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
 where p.id=target.project_id and p.citation_permitted and not p.is_hidden and not u.is_private and not c.is_hidden
 for share of p,u,c;
 if not found then raise exception 'citation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('external-cite:'||p_ip_hash||':'||p_item_id,0));
 delete from public.external_citation_dedupe where at<=now()-interval '10 minutes';
 select * into previous from public.external_citation_dedupe where ip_hash=p_ip_hash and item_id=p_item_id;
 if found then return previous.citation_id; end if;
 insert into public.citations(cited_item_id,cited_creator_id,source,context)
 values(p_item_id,target.creator_id,'external',nullif(btrim(p_context),'')) returning id into event_id;
 insert into public.external_citation_dedupe(ip_hash,item_id,citation_id) values(p_ip_hash,p_item_id,event_id);
 return event_id;
end $$;
revoke all on function public.record_external_citation(text,text,text) from public,anon,authenticated;
grant execute on function public.record_external_citation(text,text,text) to service_role;

create or replace function public.notify_visible_citation(p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare citation public.citations; recipient uuid; actor text; cited_title text;
 citing_title text; target_label text; destination text; message text;
begin
 select * into citation from public.citations where id=p_id;
 if not found or not public.is_citation_item_public(citation.cited_item_id) then return; end if;
 if citation.source='app' and not public.is_citation_project_public(citation.citing_project_id) then return; end if;
 select account_id into recipient from public.profiles where id=citation.cited_creator_id;
 select p.title,t.label into cited_title,target_label from public.citation_target(citation.cited_item_id) t join public.projects p on p.id=t.project_id;
 if citation.source='external' then
  destination:='/cite/'||citation.cited_item_id;
  message:='Someone cited '||target_label||' of '||cited_title||' in a document outside Portalink.';
 else
  select name into actor from public.profiles where id=citation.citing_creator_id;
  select title,'/p/'||profile_id::text||'/c/'||category_id::text||'/'||id::text into citing_title,destination from public.projects where id=citation.citing_project_id;
  message:=actor||' cited '||target_label||' of '||cited_title||' in "'||citing_title||'".';
 end if;
 insert into public.notifications(account_id,body,kind,citation_id,target_path,actor_profile_id)
 values(recipient,message,'citation',citation.id,destination,citation.citing_creator_id) on conflict(citation_id) do nothing;
end $$;

-- Anonymous retrieval stays explicitly opt-in at the database boundary.
create function public.mcp_citation_item(p_item_id text) returns jsonb
language sql stable security definer set search_path=public as $$
 select public.resolve_citation_item(p_item_id,true)||jsonb_build_object(
 'creatorHandle',u.handle,'portal',c.label,'coverThumbnail',p.cover_thumbnail)
 from public.citation_target(p_item_id) t join public.projects p on p.id=t.project_id
 join public.profiles u on u.id=p.profile_id join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
 where public.is_project_citable(p.id);
$$;
revoke all on function public.mcp_citation_item(text) from public;
grant execute on function public.mcp_citation_item(text) to anon,authenticated;
create function public.search_citable_items(p_query text,p_field text default null,p_creator text default null,p_limit integer default 10)
returns jsonb language sql stable security definer set search_path=public as $$
 with ranked as (
 select p.*,ts_rank_cd(to_tsvector('simple',coalesce(p.title,'')||' '||coalesce(p.summary,'')||' '||coalesce(c.label,'')),websearch_to_tsquery('simple',p_query)) as rank
 from public.projects p join public.profiles u on u.id=p.profile_id join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
 where public.is_project_citable(p.id) and char_length(p_query) between 1 and 500
 and to_tsvector('simple',coalesce(p.title,'')||' '||coalesce(p.summary,'')||' '||coalesce(c.label,''))@@websearch_to_tsquery('simple',p_query)
 and (p_field is null or lower(c.label)=lower(p_field)) and (p_creator is null or lower(u.handle)=lower(p_creator))
 ), items as (
 select p.id project_id,a.citation_id::text item_id,p.rank,p.made_on,a.position,0 page_number from ranked p join public.project_attachments a on a.project_id=p.id where a.kind='image'
 union all
 select p.id,page.id::text,p.rank,p.made_on,a.position,page.source_page_number from ranked p join public.project_attachments a on a.project_id=p.id join public.project_pages page on page.attachment_id=a.id
 where a.kind='document' and page.source_page_number<=public.attachment_page_count(a.metadata)
 ), selected as (select * from items order by rank desc,made_on desc,project_id,position,page_number,item_id limit least(greatest(coalesce(p_limit,10),1),50))
 select coalesce(jsonb_agg(public.mcp_citation_item(item_id) order by rank desc,made_on desc,project_id,position,page_number,item_id),'[]'::jsonb) from selected;
$$;
revoke all on function public.search_citable_items(text,text,text,integer) from public;
grant execute on function public.search_citable_items(text,text,text,integer) to anon,authenticated;
create index projects_mcp_search on public.projects using gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(summary,''))) where citation_permitted and not is_hidden;

create or replace function public.public_cited_in(p_item_id text) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'created_at',c.created_at,'source',c.source,'context',c.context,
 'project',case when c.source='app' then jsonb_build_object('id',p.id,'title',p.title,'creator',u.name,'profileId',u.id,'categoryId',p.category_id) end)
 order by c.created_at desc,c.id),'[]'::jsonb)
 from public.citations c left join public.projects p on p.id=c.citing_project_id left join public.profiles u on u.id=p.profile_id
 where c.cited_item_id=p_item_id and public.is_citation_item_public(c.cited_item_id)
 and (c.source='external' or public.is_citation_project_public(p.id));
$$;
-- Existing bundle calls this function once; preserve all app projection fields.
create or replace function public.public_profile_citations(p_profile_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'source',c.source,'context',c.context,
 'direction',case when c.citing_creator_id=$1 then 'outgoing' else 'incoming' end,
 'item_id',c.cited_item_id,'label',t.label,'other_creator_name',other.name,'other_creator_handle',other.handle,
 'other_project_id',op.id,'other_project_title',op.title,'other_profile_id',other.id,'other_category_id',op.category_id,
 'citing_project_title',cp.title,'created_at',c.created_at,'note',c.note)
 order by c.created_at desc,c.id),'[]'::jsonb)
 from public.citations c cross join lateral public.citation_target(c.cited_item_id) t
 left join public.projects cp on cp.id=c.citing_project_id join public.projects target on target.id=t.project_id
 join public.profiles viewer on viewer.id=$1
 left join public.profiles other on other.id=case when c.citing_creator_id=$1 then c.cited_creator_id else c.citing_creator_id end
 left join public.projects op on op.id=case when c.citing_creator_id=$1 then target.id else cp.id end
 where not viewer.is_private and viewer.show_journey
 and ((c.citing_creator_id=$1 and viewer.show_outgoing_citations) or (c.cited_creator_id=$1 and viewer.show_incoming_citations))
 and public.is_citation_item_public(c.cited_item_id) and (c.source='external' or public.is_citation_project_public(cp.id));
$$;
commit;
