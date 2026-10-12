-- REVIEW ONLY. Requires the separately reviewed external_references table.
-- No step completion flags, public counts, notifications or activity triggers.
begin;
create table public.owner_events (
 profile_id uuid not null references public.profiles(id) on delete cascade,
 event text not null check(event in ('snooze','never','previewed','shared','visit')),
 key text not null check(key ~ '^[a-z][a-z0-9-]{0,31}(:[a-z0-9-]{1,128})?$'),
 created_at timestamptz not null default now(), expires_at timestamptz,
 primary key(profile_id,event,key)
);
alter table public.owner_events enable row level security;
revoke all on public.owner_events from public,anon,authenticated;
grant select,insert,update on public.owner_events to authenticated;
create policy owner_events_read on public.owner_events for select to authenticated using(public.owns_profile(profile_id));
create policy owner_events_insert on public.owner_events for insert to authenticated with check(public.owns_profile(profile_id));
create policy owner_events_update on public.owner_events for update to authenticated using(public.owns_profile(profile_id)) with check(public.owns_profile(profile_id));
create function public.stamp_owner_event() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (old.event='never' or new.event<>old.event or new.key<>old.key or new.profile_id<>old.profile_id) then
  raise exception 'This event cannot be changed' using errcode='42501';
 end if;
 if new.event in ('previewed','shared') and new.key<>'profile' or new.event='visit' and new.key<>'main' then
  raise exception 'Invalid event key' using errcode='22023';
 end if;
 new.created_at:=now();new.expires_at:=case when new.event='snooze' then now()+interval '14 days' else null end;
 return new;
end $$;
revoke all on function public.stamp_owner_event() from public,anon,authenticated;
create trigger stamp_owner_event before insert or update on public.owner_events for each row execute function public.stamp_owner_event();
-- Private upstream observations are inputs to derived tidy-ups, not completion flags.
-- Only the worker service identity writes them. Nothing is joined into public RPCs.
create table public.studio_record_link_checks (
 profile_id uuid not null references public.profiles(id) on delete cascade,
 url text not null check(char_length(url)<=2048 and url ~ '^https?://'),
 status integer check(status between 100 and 599),
 checked_at timestamptz not null default now(),
 primary key(profile_id,url)
);
alter table public.studio_record_link_checks enable row level security;
revoke all on public.studio_record_link_checks from public,anon,authenticated;
grant select on public.studio_record_link_checks to authenticated;
grant select,insert,update on public.studio_record_link_checks to service_role;
create policy studio_record_link_owner_read on public.studio_record_link_checks for select to authenticated using(public.owns_profile(profile_id));
create function public.studio_record_status(profile_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 p public.profiles%rowtype; item record; first_project public.projects%rowtype; missing_icon public.portfolio_categories%rowtype;
 result_steps jsonb:='[]'; result_tidy jsonb:='[]'; event_rows jsonb; last_seen timestamptz;
 icons_done boolean; references_done boolean; links_ready boolean;
begin
 -- Ownership before any event/data read; authenticated non-owner -> HTTP403.
 select * into p from public.profiles where id=studio_record_status.profile_id and account_id=auth.uid();
 if not found then raise exception 'Not permitted' using errcode='42501';end if;
 select * into first_project from public.projects where projects.profile_id=p.id order by published_at desc,id limit 1;
 select count(*)>=2 and bool_and(nullif(trim(icon_name),'') is not null and icon_name<>'FolderIcon') into icons_done from public.portfolio_categories where portfolio_categories.profile_id=p.id;
 select * into missing_icon from public.portfolio_categories where portfolio_categories.profile_id=p.id and (nullif(trim(icon_name),'') is null or icon_name='FolderIcon') order by position,id limit 1;
 select exists(select 1 from public.citations where citing_creator_id=p.id) or exists(select 1 from public.external_references where owner_profile_id=p.id) into references_done;
 select coalesce(jsonb_agg(jsonb_build_object('event',event,'key',key,'createdAt',created_at,'expiresAt',expires_at)),'[]') into event_rows from public.owner_events where owner_events.profile_id=p.id;
 select max(created_at) into last_seen from public.owner_events where owner_events.profile_id=p.id and event='visit';
 for item in select * from (values
  ('identity','Add your name, handle and photo', nullif(trim(p.name),'') is not null and nullif(trim(p.handle),'') is not null and nullif(trim(p.avatar_url),'') is not null,case when nullif(trim(p.name),'') is null then 'identity' when nullif(trim(p.handle),'') is null then 'handle' else 'photo' end,true),
  ('headline','Add a headline',nullif(trim(p.headline),'') is not null,'headline',true),
  ('school-city','Add your school and city',nullif(trim(to_jsonb(p)->>'school'),'') is not null and nullif(trim(p.location),'') is not null,'school',false),
  ('first-project','Publish your first project',first_project.id is not null,'new-project',true),
  ('dates','Set the dates you made these',exists(select 1 from public.projects q where q.profile_id=p.id and q.made_on is not null and q.made_on<>(q.published_at at time zone 'UTC')::date),'date',true),
  ('portals',case when missing_icon.id is null then 'Organise your portals' else 'Give '||missing_icon.label||' an icon' end,coalesce(icons_done,false),case when missing_icon.id is null then 'portals' else 'icon' end,true),
  ('citable','Make one project citable',exists(select 1 from public.projects q where q.profile_id=p.id and q.citation_permitted),'citable',true),
  ('reference','Add a reference',references_done,'reference',true),
  ('appearance','Choose your public appearance',p.public_appearance is not null,'appearance',true),
  ('preview','Preview your link as a visitor',exists(select 1 from public.owner_events e where e.profile_id=p.id and e.event='previewed'),'preview',true),
  ('share','Share your link',exists(select 1 from public.owner_events e where e.profile_id=p.id and e.event='shared'),'share',true),
  ('connect-ai','Connect your AI',false,'connect-ai',false)
 ) as s(key,label,done,field,available) loop
  result_steps:=result_steps||jsonb_build_array(jsonb_build_object('key',item.key,'label',item.label,'done',item.done,'available',item.available,'field',item.field,'projectId',case when item.field in ('date','citable','reference') then first_project.id else null end,'portalId',case when item.field='icon' then missing_icon.id else first_project.category_id end));
 end loop;
 for item in select * from public.projects q where q.profile_id=p.id order by published_at desc,id loop
  if nullif(trim(item.summary),'') is null then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','summary:'||item.id,'label','Add a summary to '||item.title,'chip','No summary','field','summary','projectId',item.id,'portalId',item.category_id));end if;
  if item.made_on is null or item.made_on=(item.published_at at time zone 'UTC')::date then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','date:'||item.id,'label','Set when you made '||item.title,'chip','Date is upload date','field','date','projectId',item.id,'portalId',item.category_id));end if;
  if not exists(select 1 from public.project_attachments a where a.project_id=item.id and a.is_cover) and to_jsonb(item)->>'cover_thumbnail' is null then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','cover:'||item.id,'label','Choose a cover for '||item.title,'chip','No chosen cover','field','cover','projectId',item.id,'portalId',item.category_id));end if;
  if item.summary ~ '<[[:alpha:]/][^>]*>|\[[^]]+\]\([^)]*\)|```|__[^_]+__' then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','markup:'||item.id,'label','Tidy the summary of '||item.title,'chip','Unrendered markup','field','summary','projectId',item.id,'portalId',item.category_id));end if;
  if exists(select 1 from public.project_attachments a where a.project_id=item.id and a.kind='document' and (a.status='processing-failed' or to_jsonb(a)->>'pdf_processing_status'='failed' or coalesce(a.metadata,'{}')@>'{"renderFailed":true}')) then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','render:'||item.id,'label','Check the document pages in '||item.title,'chip','Render failed','field','files','projectId',item.id,'portalId',item.category_id));end if;
 end loop;
 for item in select c.*,count(q.id) as works from public.portfolio_categories c left join public.projects q on q.category_id=c.id and q.profile_id=p.id where c.profile_id=p.id group by c.id order by c.position,c.id loop

  if item.works=1 then result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','portal:'||item.id,'label','Add work to '||item.label,'field','portal-project','portalId',item.id));end if;
 end loop;
 for item in select c.url,c.status,c.checked_at from public.studio_record_link_checks c where c.profile_id=p.id and c.status not between 200 and 299 and exists(select 1 from jsonb_array_elements(p.links) l where l->>'href'=c.url) order by c.url loop
  result_tidy:=result_tidy||jsonb_build_array(jsonb_build_object('key','link:'||md5(item.url),'label','Fix your profile link','field','link','url',item.url));
 end loop;
 select not exists(select 1 from jsonb_array_elements(p.links) l where l->>'href' ~ '^https?://' and not exists(select 1 from public.studio_record_link_checks c where c.profile_id=p.id and c.url=l->>'href' and c.status is not null and c.checked_at>now()-interval '2 days')) into links_ready;
 return jsonb_build_object('profileId',p.id,'generatedAt',now(),'steps',result_steps,'tidyups',result_tidy,'events',event_rows,'lastSeen',last_seen,'linkChecksReady',links_ready,
  'projectTargets',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'portalId',q.category_id) order by q.id),'[]') from public.projects q where q.profile_id=p.id),
  'portalTargets',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'needsIcon',nullif(trim(c.icon_name),'') is null or c.icon_name='FolderIcon') order by c.id),'[]') from public.portfolio_categories c where c.profile_id=p.id));
end $$;
revoke all on function public.studio_record_status(uuid) from public,anon,authenticated;
grant execute on function public.studio_record_status(uuid) to authenticated;
-- Service-only queue derives current URLs and selects observations due daily.
create function public.studio_record_links_due(batch_limit integer default 100) returns table(profile_id uuid,url text) language sql security definer set search_path='' as $$
 select distinct p.id,l->>'href' from public.profiles p cross join lateral jsonb_array_elements(p.links) l
 left join public.studio_record_link_checks c on c.profile_id=p.id and c.url=l->>'href'
 where l->>'href' ~ '^https?://' and char_length(l->>'href')<=2048 and (c.checked_at is null or c.checked_at<now()-interval '1 day')
 order by p.id,l->>'href' limit greatest(1,least(batch_limit,100));
$$;
revoke all on function public.studio_record_links_due(integer) from public,anon,authenticated;
grant execute on function public.studio_record_links_due(integer) to service_role;
commit;
