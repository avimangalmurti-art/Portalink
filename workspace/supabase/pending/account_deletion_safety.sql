-- REVIEW CANDIDATE. Not in migrations: cannot be applied by db push accidentally.
-- No deletion is enabled by applying this transaction. No jobs are scheduled.
begin;

create schema if not exists deletion_private;
revoke all on schema deletion_private from public, anon, authenticated;

create table deletion_private.release_gate (
  singleton boolean primary key default true check (singleton),
  requests_enabled boolean not null default false,
  worker_enabled boolean not null default false
);
insert into deletion_private.release_gate default values;

-- Deliberately no FK to auth.users/profiles: recovery checkpoints and upload
-- fences must outlive those rows, including an uncertain Auth response.
create table deletion_private.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  profile_id uuid,
  project_ids uuid[] not null default '{}',
  status text not null default 'pending' check(status in ('pending','processing','cancelled','completed')),
  phase text not null default 'storage' check(phase in ('storage','anonymize','auth','complete')),
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null default now() + interval '48 hours',
  irreversible_started_at timestamptz,
  completed_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  check(delete_after >= requested_at + interval '48 hours')
);
create unique index one_account_deletion on deletion_private.jobs(account_id) where status <> 'cancelled';
create index due_account_deletions on deletion_private.jobs(delete_after) where status in ('pending','processing');
create table deletion_private.files (
  job_id uuid not null references deletion_private.jobs(id) on delete restrict,
  bucket text not null check(bucket in ('avatars','project-media','message-media')),
  path text not null,
  removed_at timestamptz,
  primary key(job_id,bucket,path)
);
revoke all on all tables in schema deletion_private from public, anon, authenticated;

alter table public.direct_conversations
  drop constraint direct_conversations_participant_one_profile_id_fkey,
  drop constraint direct_conversations_participant_two_profile_id_fkey,
  alter column participant_one_profile_id drop not null,
  alter column participant_two_profile_id drop not null,
  add constraint direct_conversations_participant_one_profile_id_fkey foreign key(participant_one_profile_id) references public.profiles(id) on delete set null,
  add constraint direct_conversations_participant_two_profile_id_fkey foreign key(participant_two_profile_id) references public.profiles(id) on delete set null;
alter table public.direct_messages
  drop constraint direct_messages_sender_profile_id_fkey,
  alter column sender_profile_id drop not null,
  add constraint direct_messages_sender_profile_id_fkey foreign key(sender_profile_id) references public.profiles(id) on delete set null,
  add column removed_at timestamptz;
alter table public.direct_message_attachments
  alter column storage_path drop not null,
  add column removed_at timestamptz;
alter table public.project_comments
  drop constraint project_comments_author_profile_id_fkey,
  drop constraint project_comments_parent_id_fkey,
  drop constraint project_comments_root_id_fkey,
  alter column author_profile_id drop not null,
  add constraint project_comments_author_profile_id_fkey foreign key(author_profile_id) references public.profiles(id) on delete set null,
  add constraint project_comments_parent_id_fkey foreign key(parent_id) references public.project_comments(id) on delete set null,
  add constraint project_comments_root_id_fkey foreign key(root_id) references public.project_comments(id) on delete set null,
  add column removed_at timestamptz;

-- Each exclusive content row is marked in the same transaction. Values are
-- untouched during grace, so cancellation needs no reconstruction from backups.
do $$ declare t text; cols text; begin
  foreach t in array array['profiles','portfolio_categories','projects','project_drafts','project_attachments','direct_messages','direct_message_attachments','project_comments'] loop
    execute format('alter table public.%I add column pending_deletion_at timestamptz', t);
    -- Preserve existing per-column ACLs and expand only former table-wide grants.
    select string_agg(quote_ident(attname), ',') into cols from pg_attribute
      where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped
        and attname not in ('pending_deletion_at','removed_at');
    if has_table_privilege('authenticated',format('public.%I',t),'UPDATE') then
      execute format('revoke update on public.%I from authenticated',t);
      execute format('grant update (%s) on public.%I to authenticated',cols,t);
    end if;
    if has_table_privilege('authenticated',format('public.%I',t),'INSERT') then
      execute format('revoke insert on public.%I from authenticated',t);
      execute format('grant insert (%s) on public.%I to authenticated',cols,t);
    end if;
  end loop;
end $$;
drop policy if exists profiles_delete on public.profiles;
revoke delete on public.profiles from authenticated, anon;

create function deletion_private.account_pending(p_account uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from deletion_private.jobs where account_id=p_account and status in ('pending','processing','completed'));
$$;
create function deletion_private.profile_pending(p_profile uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from deletion_private.jobs where profile_id=p_profile and status in ('pending','processing','completed'));
$$;
create function deletion_private.owns_path(j deletion_private.jobs, bucket text, path text) returns boolean
language sql immutable as $$
  select case bucket
    when 'avatars' then split_part(path,'/',1)=j.account_id::text
    when 'message-media' then split_part(path,'/',1)=j.profile_id::text
    when 'project-media' then split_part(path,'/',1)=j.profile_id::text
      or (split_part(path,'/',1)='posts' and split_part(path,'/',2)=any(select unnest(j.project_ids)::text))
    else false end;
$$;

-- Storage metadata triggers also run for service-role PDF/TUS writes. Take the
-- same lock as the request to fence in-flight commits before snapshotting files.
create function deletion_private.path_account(bucket text,path text) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    (select u.id from auth.users u where bucket='avatars' and u.id::text=split_part(path,'/',1)),
    (select p.account_id from public.profiles p where bucket in ('project-media','message-media') and (
      p.id::text=split_part(path,'/',1) or (bucket='project-media' and split_part(path,'/',1)='posts'
        and exists(select 1 from public.projects pr where pr.profile_id=p.id and pr.id::text=split_part(path,'/',2))))),
    (select j.account_id from deletion_private.jobs j where j.status<>'cancelled' and deletion_private.owns_path(j,bucket,path) limit 1)
  );
$$;
create function deletion_private.fence_storage_write() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_account uuid; j deletion_private.jobs; r record;
begin
  if tg_op in ('UPDATE','DELETE') then
    owner_account:=deletion_private.path_account(old.bucket_id,old.name);
    if owner_account is not null then perform pg_advisory_xact_lock(hashtextextended(owner_account::text,17)); end if;
  end if;
  if tg_op='DELETE' then
    for j in select * from deletion_private.jobs where status in ('pending','processing','completed') loop
      if deletion_private.owns_path(j,old.bucket_id,old.name) and not (
        auth.role()='service_role' and j.status='processing' and j.phase='storage' and j.lease_until>now()
        and (select worker_enabled from deletion_private.release_gate)
        and exists(select 1 from deletion_private.files f where f.job_id=j.id and f.bucket=old.bucket_id and f.path=old.name)
      ) then raise exception 'owner pending deletion: removal disabled'; end if;
    end loop;
    return old;
  end if;
  if tg_op='UPDATE' then
    for j in select * from deletion_private.jobs where status in ('pending','processing','completed') loop
      if deletion_private.owns_path(j,old.bucket_id,old.name) then raise exception 'owner pending deletion: move disabled'; end if;
    end loop;
  end if;
  if new.bucket_id='avatars' then
    begin owner_account:=split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then owner_account:=null; end;
  elsif new.bucket_id in ('project-media','message-media') then
    select p.account_id into owner_account from public.profiles p where
      p.id::text=split_part(new.name,'/',1) or (new.bucket_id='project-media' and split_part(new.name,'/',1)='posts'
        and exists(select 1 from public.projects pr where pr.profile_id=p.id and pr.id::text=split_part(new.name,'/',2)));
  end if;
  if owner_account is not null then perform pg_advisory_xact_lock(hashtextextended(owner_account::text,17)); end if;
  for j in select * from deletion_private.jobs where status in ('pending','processing','completed') loop
    if deletion_private.owns_path(j,new.bucket_id,new.name) then raise exception 'owner pending deletion: upload disabled'; end if;
  end loop;
  return new;
end $$;
create trigger account_deletion_storage_fence before insert or update or delete on storage.objects
for each row execute function deletion_private.fence_storage_write();

-- Guard browser writes, old RPCs and PDF progress/complete/retry uniformly.
-- Internal lifecycle transactions have no user JWT and use a private marker;
-- none of these internal functions are executable by browser roles.
create function deletion_private.fence_content_write() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; owner_account uuid; owner_profile uuid; owner_project uuid;
begin
  if auth.uid() is null and current_setting('portalink.deletion_internal',true)='on' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='profiles' then owner_account:=(r->>'account_id')::uuid; owner_profile:=(r->>'id')::uuid;
  elsif tg_table_name in ('projects','portfolio_categories','project_drafts') then owner_profile:=(r->>'profile_id')::uuid;
  elsif tg_table_name='direct_messages' then owner_profile:=(r->>'sender_profile_id')::uuid;
  elsif tg_table_name='project_comments' then owner_profile:=(r->>'author_profile_id')::uuid;
  elsif tg_table_name='direct_message_attachments' then select sender_profile_id into owner_profile from public.direct_messages where id=(r->>'message_id')::uuid;
  elsif tg_table_name='project_attachments' then owner_project:=(r->>'project_id')::uuid;
  elsif tg_table_name='pdf_processing_jobs' then owner_project:=(r->>'post_id')::uuid;
  end if;
  if owner_project is not null then select profile_id into owner_profile from public.projects where id=owner_project; end if;
  if owner_account is null then select account_id into owner_account from public.profiles where id=owner_profile; end if;
  if owner_account is not null then perform pg_advisory_xact_lock(hashtextextended(owner_account::text,17)); end if;
  if deletion_private.account_pending(auth.uid()) or deletion_private.account_pending(owner_account) or deletion_private.profile_pending(owner_profile)
    then raise exception 'account pending deletion'; end if;
  if tg_table_name='profiles' and tg_op='DELETE' then raise exception 'use the account deletion lifecycle'; end if;
  if tg_op='UPDATE' and to_jsonb(old)->>'removed_at' is not null and (
    to_jsonb(old)->'body' is distinct from to_jsonb(new)->'body' or
    to_jsonb(old)->'storage_path' is distinct from to_jsonb(new)->'storage_path' or
    to_jsonb(old)->'removed_at' is distinct from to_jsonb(new)->'removed_at'
  ) then raise exception 'removed content is immutable'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','portfolio_categories','projects','project_drafts','project_attachments','direct_messages','direct_message_attachments','project_comments','pdf_processing_jobs'] loop
    execute format('create trigger deletion_content_fence before insert or update or delete on public.%I for each row execute function deletion_private.fence_content_write()',t);
  end loop;
end $$;

create function deletion_private.mark_content(j deletion_private.jobs, stamp timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.profiles set pending_deletion_at=stamp where id=j.profile_id;
  update public.projects set pending_deletion_at=stamp where profile_id=j.profile_id;
  update public.portfolio_categories set pending_deletion_at=stamp where profile_id=j.profile_id;
  update public.project_drafts set pending_deletion_at=stamp where profile_id=j.profile_id;
  update public.project_attachments set pending_deletion_at=stamp where project_id=any(j.project_ids);
  update public.direct_messages set pending_deletion_at=stamp where sender_profile_id=j.profile_id;
  update public.direct_message_attachments a set pending_deletion_at=stamp from public.direct_messages m where m.id=a.message_id and m.sender_profile_id=j.profile_id;
  update public.project_comments set pending_deletion_at=stamp where author_profile_id=j.profile_id;
end $$;

-- Service-only RPCs receive account identity ONLY from a verified getUser token.
create function public.request_account_deletion(p_account_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; p uuid;
begin
  if not (select requests_enabled from deletion_private.release_gate) then raise exception 'account deletion disabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,17));
  select * into j from deletion_private.jobs where account_id=p_account_id and status<>'cancelled' for update;
  if j.id is not null then return jsonb_build_object('id',j.id,'status',j.status,'deleteAfter',j.delete_after); end if;
  if not exists(select 1 from auth.users where id=p_account_id) then raise exception 'account not found'; end if;
  select id into p from public.profiles where account_id=p_account_id for update;
  insert into deletion_private.jobs(account_id,profile_id,project_ids)
    values(p_account_id,p,array(select id from public.projects where profile_id=p)) returning * into j;
  perform set_config('portalink.deletion_internal','on',true);
  perform deletion_private.mark_content(j,j.requested_at);
  perform set_config('portalink.deletion_internal','off',true);
  return jsonb_build_object('id',j.id,'status',j.status,'deleteAfter',j.delete_after);
end $$;
create function public.cancel_account_deletion(p_account_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,17));
  select * into j from deletion_private.jobs where account_id=p_account_id and status<>'cancelled' for update;
  if j.id is null then return jsonb_build_object('status','cancelled'); end if;
  if j.status<>'pending' or j.irreversible_started_at is not null then raise exception 'permanent deletion has started'; end if;
  perform set_config('portalink.deletion_internal','on',true);
  perform deletion_private.mark_content(j,null);
  update deletion_private.jobs set status='cancelled' where id=j.id;
  perform set_config('portalink.deletion_internal','off',true);
  return jsonb_build_object('status','cancelled');
end $$;
create function public.account_deletion_status(p_account_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select jsonb_build_object('id',id,'status',status,'deleteAfter',delete_after)
    from deletion_private.jobs where account_id=p_account_id and status<>'cancelled'),'{}'::jsonb);
$$;

create function public.claim_account_deletion() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs;
begin
  if not (select worker_enabled from deletion_private.release_gate) then raise exception 'account deletion worker disabled'; end if;
  select * into j from deletion_private.jobs where delete_after<=now() and status in ('pending','processing')
    and (lease_until is null or lease_until<now()) order by delete_after for update skip locked limit 1;
  if j.id is null then return null; end if;
  update deletion_private.jobs set status='processing',irreversible_started_at=coalesce(irreversible_started_at,now()),
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,last_error=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

create function deletion_private.lock_job(p_job uuid,p_lease uuid) returns deletion_private.jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  if not (select worker_enabled from deletion_private.release_gate) then raise exception 'account deletion worker disabled'; end if;
  select * into j from deletion_private.jobs where id=p_job for update;
  if j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() or j.id is null then raise exception 'invalid deletion lease'; end if;
  update deletion_private.jobs set lease_until=now()+interval '5 minutes' where id=j.id;
  return j;
end $$;

-- Snapshot/reconcile objects by exclusive ownership, never by conversation id.
-- Storage rows are read for discovery only; deletion always uses Storage API.
create function public.account_deletion_batch(p_job uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; batch jsonb;
begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if j.phase<>'storage' then return jsonb_build_object('phase',j.phase); end if;
  insert into deletion_private.files(job_id,bucket,path)
    select j.id,o.bucket_id,o.name from storage.objects o where deletion_private.owns_path(j,o.bucket_id,o.name)
    on conflict(job_id,bucket,path) do nothing;
  -- Catch inconsistent cross-owner attachment references instead of guessing.
  if exists(select 1 from public.direct_message_attachments a join public.direct_messages m on m.id=a.message_id
      where m.sender_profile_id=j.profile_id and a.storage_path is not null and not deletion_private.owns_path(j,'message-media',a.storage_path))
    then raise exception 'attachment ownership mismatch; manual review required'; end if;
  if exists(select 1 from public.direct_message_attachments a join public.direct_messages m on m.id=a.message_id
      where m.sender_profile_id is distinct from j.profile_id and a.storage_path is not null and deletion_private.owns_path(j,'message-media',a.storage_path))
    then raise exception 'surviving attachment references owned file; manual review required'; end if;
  select jsonb_agg(to_jsonb(f)) into batch from (select bucket,path from deletion_private.files where job_id=j.id and removed_at is null order by bucket,path limit 100) f;
  if batch is null then
    if exists(select 1 from storage.objects o where deletion_private.owns_path(j,o.bucket_id,o.name)) then raise exception 'storage reconciliation incomplete'; end if;
    update deletion_private.jobs set phase='anonymize' where id=j.id;
    return jsonb_build_object('phase','anonymize');
  end if;
  return jsonb_build_object('phase','storage','files',batch);
end $$;
create function public.checkpoint_account_deletion_files(p_job uuid,p_lease uuid,p_files jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if j.phase<>'storage' then raise exception 'invalid deletion phase'; end if;
  if exists(select 1 from jsonb_to_recordset(p_files) as f(bucket text,path text)
    join storage.objects o on o.bucket_id=f.bucket and o.name=f.path) then raise exception 'storage removal not confirmed'; end if;
  update deletion_private.files f set removed_at=now() from jsonb_to_recordset(p_files) as done(bucket text,path text)
    where f.job_id=j.id and f.bucket=done.bucket and f.path=done.path and f.removed_at is null;
end $$;
create function public.anonymize_account_deletion(p_job uuid,p_lease uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if j.phase='auth' then return; end if;
  if j.phase<>'anonymize' then raise exception 'storage must finish first'; end if;
  perform set_config('portalink.deletion_internal','on',true);
  update public.direct_message_attachments a set storage_path=null,file_name='Removed attachment',mime_type='application/octet-stream',removed_at=now(),pending_deletion_at=null
    from public.direct_messages m where a.message_id=m.id and m.sender_profile_id=j.profile_id;
  update public.direct_messages set body='Message removed',sender_profile_id=null,removed_at=now(),pending_deletion_at=null,edited_at=null
    where sender_profile_id=j.profile_id;
  update public.project_comments set body='Comment removed',author_profile_id=null,removed_at=now(),pending_deletion_at=null where author_profile_id=j.profile_id;
  update public.direct_conversations set participant_one_profile_id=case when participant_one_profile_id=j.profile_id then null else participant_one_profile_id end,
    participant_two_profile_id=case when participant_two_profile_id=j.profile_id then null else participant_two_profile_id end,
    initiator_profile_id=case when initiator_profile_id=j.profile_id then null else initiator_profile_id end
    where j.profile_id in (participant_one_profile_id,participant_two_profile_id);
  -- Project/media rows are exclusive; delete them explicitly before categories
  -- (the category FK is RESTRICT). Shared messages are never deleted here.
  delete from public.projects where profile_id=j.profile_id;
  delete from public.profiles where id=j.profile_id;
  update deletion_private.jobs set phase='auth' where id=j.id;
  perform set_config('portalink.deletion_internal','off',true);
end $$;
create function public.finish_account_deletion(p_job uuid,p_lease uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if j.phase<>'auth' or exists(select 1 from auth.users where id=j.account_id) then raise exception 'auth deletion not confirmed'; end if;
  if exists(select 1 from storage.objects o where deletion_private.owns_path(j,o.bucket_id,o.name)) then raise exception 'storage reconciliation incomplete'; end if;
  update deletion_private.jobs set status='completed',phase='complete',completed_at=now(),lease_token=null,lease_until=null,last_error=null where id=j.id;
end $$;
create function public.fail_account_deletion(p_job uuid,p_lease uuid,p_error text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform deletion_private.lock_job(p_job,p_lease);
  update deletion_private.jobs set last_error=left(p_error,200),lease_until=now()+interval '5 minutes' where id=p_job;
end $$;

-- No browser/public execution, including Supabase's default function grants.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='deletion_private' or (n.nspname='public' and p.proname in (
      'request_account_deletion','cancel_account_deletion','account_deletion_status','claim_account_deletion',
      'account_deletion_batch','checkpoint_account_deletion_files','anonymize_account_deletion','finish_account_deletion','fail_account_deletion')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    if f.signature::text not like 'deletion_private.%' then execute format('grant execute on function %s to service_role',f.signature); end if;
  end loop;
end $$;


-- Nullable participants require explicit TRUE membership, never NOT IN(NULL).
create or replace function public.resolve_direct_message_permission(p_conversation_id uuid)
returns public.direct_conversations language plpgsql security definer set search_path = public as $$
declare
  viewer_profile_id uuid;
  recipient_profile_id uuid;
  conversation public.direct_conversations%rowtype;
  recipient_follows_sender boolean;
  target_permission text;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or not coalesce(viewer_profile_id = conversation.participant_one_profile_id or viewer_profile_id = conversation.participant_two_profile_id, false)
  then raise exception 'permission denied'; end if;
  if not public.can_interact_direct_conversation(conversation.id) then raise exception 'conversation blocked'; end if;
  if conversation.established_at is not null then return conversation; end if;

  recipient_profile_id := case when conversation.participant_one_profile_id = viewer_profile_id
    then conversation.participant_two_profile_id else conversation.participant_one_profile_id end;
  if conversation.request_message_sent_at is not null and conversation.initiator_profile_id <> viewer_profile_id
  then raise exception 'accept request before replying'; end if;
  if not public.can_view_profile(recipient_profile_id) then raise exception 'messages unavailable'; end if;
  select exists (select 1 from public.profile_follows follow
    where follow.follower_profile_id = recipient_profile_id and follow.target_profile_id = viewer_profile_id
      and follow.status = 'following') into recipient_follows_sender;
  select coalesce((select permission from public.messaging_preferences where profile_id = recipient_profile_id), 'requests') into target_permission;
  if not recipient_follows_sender and target_permission <> 'requests' then
    if target_permission <> 'followers' or not exists (
      select 1 from public.profile_follows follow
      where follow.follower_profile_id = viewer_profile_id and follow.target_profile_id = recipient_profile_id
        and follow.status = 'following'
    ) then raise exception 'messages unavailable'; end if;
  end if;

  update public.direct_conversations
    set status = case when recipient_follows_sender then 'active' else 'request' end,
        initiator_profile_id = case when request_message_sent_at is null then viewer_profile_id else initiator_profile_id end,
        updated_at = now()
    where id = conversation.id returning * into conversation;
  return conversation;
end;
$$;

create or replace function public.send_direct_message(p_conversation_id uuid, p_body text, p_attachments jsonb default '[]'::jsonb)
returns setof public.direct_messages language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype; inserted public.direct_messages%rowtype; attachment jsonb;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null then raise exception 'permission denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(viewer_profile_id::text, 0));
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or not coalesce(viewer_profile_id = conversation.participant_one_profile_id or viewer_profile_id = conversation.participant_two_profile_id, false) then raise exception 'permission denied'; end if;
  if exists (select 1 from public.direct_message_blocks b where
    b.blocker_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
    and b.blocked_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id))
  then raise exception 'conversation blocked'; end if;
  conversation := public.resolve_direct_message_permission(p_conversation_id);
  if conversation.status = 'request' and conversation.initiator_profile_id <> viewer_profile_id then raise exception 'accept request before replying'; end if;
  if conversation.status = 'request' and (conversation.request_message_sent_at is not null or exists (select 1 from public.direct_messages m where m.conversation_id = p_conversation_id)) then raise exception 'message request awaiting response'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then raise exception 'invalid attachments'; end if;
  if conversation.status = 'request' and jsonb_array_length(p_attachments) > 0 then raise exception 'text-only invitation required'; end if;
  if jsonb_array_length(p_attachments) > 5 then raise exception 'invalid attachments'; end if;
  if char_length(trim(coalesce(p_body, ''))) > 4000 or (char_length(trim(coalesce(p_body, ''))) = 0 and jsonb_array_length(p_attachments) = 0) then raise exception 'invalid message'; end if;
  if (select count(*) from public.direct_message_send_events event where event.sender_profile_id = viewer_profile_id and event.sent_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.direct_message_send_events event where event.sender_profile_id = viewer_profile_id and event.sent_at > now() - interval '1 day') >= 500
  then raise exception 'rate limit reached'; end if;
  insert into public.direct_message_send_events(sender_profile_id) values (viewer_profile_id);
  if conversation.status = 'request' then
    update public.direct_conversations set request_message_sent_at = now() where id = p_conversation_id;
  else
    update public.direct_conversations set established_at = coalesce(established_at, now()) where id = p_conversation_id;
  end if;
  insert into public.direct_messages(conversation_id, sender_profile_id, body)
  values (p_conversation_id, viewer_profile_id, trim(coalesce(p_body, ''))) returning * into inserted;
  for attachment in select value from jsonb_array_elements(p_attachments)
  loop
    if split_part(attachment->>'storagePath', '/', 1) <> viewer_profile_id::text
      or split_part(attachment->>'storagePath', '/', 2) <> p_conversation_id::text
      or coalesce((attachment->>'sizeBytes')::bigint, 0) not between 1 and 26214400
      or not exists (select 1 from storage.objects object where object.bucket_id = 'message-media' and object.name = attachment->>'storagePath')
    then raise exception 'invalid attachment'; end if;
    insert into public.direct_message_attachments(id, message_id, file_name, mime_type, size_bytes, storage_path)
    values ((attachment->>'id')::uuid, inserted.id, left(attachment->>'fileName', 240), left(coalesce(attachment->>'mimeType', 'application/octet-stream'), 160), (attachment->>'sizeBytes')::bigint, attachment->>'storagePath');
  end loop;
  return next inserted;
end;
$$;

create or replace function public.accept_direct_message_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or not coalesce(viewer_profile_id = conversation.participant_one_profile_id or viewer_profile_id = conversation.participant_two_profile_id, false)
  then raise exception 'permission denied'; end if;
  if not public.can_interact_direct_conversation(p_conversation_id) then raise exception 'conversation blocked'; end if;
  if conversation.initiator_profile_id = viewer_profile_id then raise exception 'requester cannot accept own request'; end if;
  if conversation.established_at is not null then return; end if;
  if conversation.request_message_sent_at is null then raise exception 'no message request to accept'; end if;
  update public.direct_conversations set status = 'active', established_at = now(), updated_at = now()
    where id = p_conversation_id;
  insert into public.direct_conversation_states(conversation_id, profile_id, archived_at)
    values (p_conversation_id, viewer_profile_id, null)
    on conflict (conversation_id, profile_id) do update set archived_at = null, updated_at = now();
end;
$$;

create or replace function public.delete_direct_message_request(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; conversation public.direct_conversations%rowtype;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  select * into conversation from public.direct_conversations where id = p_conversation_id for update;
  if viewer_profile_id is null or conversation.id is null or not coalesce(viewer_profile_id = conversation.participant_one_profile_id or viewer_profile_id = conversation.participant_two_profile_id, false)
  then raise exception 'permission denied'; end if;
  if conversation.status <> 'request' or conversation.initiator_profile_id = viewer_profile_id
    or conversation.request_message_sent_at is null then raise exception 'no incoming message request'; end if;
  insert into public.direct_conversation_states(conversation_id, profile_id, archived_at)
    values (p_conversation_id, viewer_profile_id, now())
    on conflict (conversation_id, profile_id) do update set archived_at = excluded.archived_at, updated_at = now();
  update public.notifications set read_at = now()
    where account_id = (select auth.uid()) and conversation_id = p_conversation_id and kind = 'message' and read_at is null;
end;
$$;

create or replace function public.can_interact_direct_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.direct_conversations conversation
    where conversation.id = p_conversation_id
      and public.is_direct_conversation_participant(conversation.id)
      and conversation.participant_one_profile_id is not null and conversation.participant_two_profile_id is not null
      and not deletion_private.profile_pending(conversation.participant_one_profile_id)
      and not deletion_private.profile_pending(conversation.participant_two_profile_id)
      and not exists (
        select 1 from public.direct_message_blocks block
        where block.blocker_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
          and block.blocked_profile_id in (conversation.participant_one_profile_id, conversation.participant_two_profile_id)
      )
  );
$$;

create or replace function public.mark_direct_conversation_read(p_conversation_id uuid, p_through_created_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare viewer_profile_id uuid; cursor_at timestamptz;
begin
  select id into viewer_profile_id from public.profiles where account_id = (select auth.uid());
  if viewer_profile_id is null or not public.is_direct_conversation_participant(p_conversation_id) then raise exception 'permission denied'; end if;
  perform 1 from public.direct_conversations where id = p_conversation_id for update;
  
  if not exists (select 1 from public.direct_conversations where id = p_conversation_id and status = 'active') then return; end if;
  select max(created_at) into cursor_at from public.direct_messages
    where conversation_id = p_conversation_id and sender_profile_id is distinct from viewer_profile_id
      and created_at <= p_through_created_at;
  if cursor_at is null then return; end if;
  insert into public.direct_conversation_reads(conversation_id, profile_id, last_read_at)
    values (p_conversation_id, viewer_profile_id, cursor_at)
    on conflict (conversation_id, profile_id) do update
      set last_read_at = greatest(public.direct_conversation_reads.last_read_at, excluded.last_read_at);
  update public.notifications set read_at = now()
    where account_id = (select auth.uid()) and conversation_id = p_conversation_id
      and kind = 'message' and read_at is null and created_at <= cursor_at;
end;
$$;

create or replace function public.claim_pdf_processing_job(
  p_worker_id text,
  p_lease_seconds integer default 1200
) returns table (
  id uuid,
  post_id uuid,
  attachment_id text,
  source_bucket text,
  source_path text,
  page_offset integer,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_post uuid;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  -- A worker that disappears cannot leave a post spinning forever. Once every
  -- lease attempt has been exhausted, expose a clean retryable failure.
  for stale_post in
    with exhausted as (
      update public.pdf_processing_jobs as expired
      set
        status = 'failed',
        error_code = 'worker_timeout',
        error_message = 'PDF processing stopped before it finished. The original file is safe and the preview can be retried.',
        is_retryable = true,
        finished_at = now(),
        lease_expires_at = null,
        updated_at = now()
      where not exists(select 1 from public.projects owner_project where owner_project.id=expired.post_id and deletion_private.profile_pending(owner_project.profile_id)) and expired.status = 'processing'
        and expired.lease_expires_at < now()
        and expired.attempt_count >= expired.max_attempts
      returning expired.post_id, expired.attachment_id
    )
    select distinct exhausted.post_id from exhausted
  loop
    update public.project_attachments a
    set
      status = 'processing-failed',
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'processingError', 'PDF processing stopped before it finished.'
      )
    from public.pdf_processing_jobs j
    where j.post_id = stale_post
      and j.attachment_id = a.id
      and j.status = 'failed';
    perform public.refresh_pdf_post_status(stale_post);
  end loop;

  return query
  with candidate as (
    select j.id
    from public.pdf_processing_jobs j
    where not exists(select 1 from public.projects owner_project where owner_project.id=j.post_id and deletion_private.profile_pending(owner_project.profile_id)) and (
        (j.status = 'queued' and j.available_at <= now())
        or (
          j.status = 'processing'
          and j.lease_expires_at < now()
          and j.attempt_count < j.max_attempts
        )
      )
      and not exists (
        select 1
        from public.pdf_processing_jobs failed
        where failed.post_id = j.post_id and failed.status = 'failed'
      )
      and not exists (
        select 1
        from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id
          and previous.status <> 'completed'
          and (
            previous.source_position < j.source_position
            or (
              previous.source_position = j.source_position
              and previous.created_at < j.created_at
            )
          )
      )
    order by j.available_at, j.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.pdf_processing_jobs j
    set
      status = 'processing',
      worker_id = trim(p_worker_id),
      attempt_count = j.attempt_count + 1,
      started_at = coalesce(j.started_at, now()),
      finished_at = null,
      lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
      page_offset = coalesce((
        select sum(previous.page_count)
        from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id
          and previous.status = 'completed'
          and (
            previous.source_position < j.source_position
            or (
              previous.source_position = j.source_position
              and previous.created_at < j.created_at
            )
          )
      ), 0)::integer,
      error_code = null,
      error_message = null,
      failed_page = null,
      updated_at = now()
    from candidate
    where j.id = candidate.id
    returning j.*
  )
  select
    claimed.id,
    claimed.post_id,
    claimed.attachment_id,
    claimed.source_bucket,
    claimed.source_path,
    claimed.page_offset,
    claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id and (p.pending_deletion_at is null or p.account_id = (select auth.uid()))
      and (
        not p.is_private
        or p.account_id = (select auth.uid())
        or exists (
          select 1 from public.profile_follows f
          where f.target_profile_id = p.id
            and f.follower_account_id = (select auth.uid())
            and f.status = 'following'
        )
        or exists (
          select 1 from public.profile_follows f
          where f.follower_profile_id = p.id
            and public.owns_profile(f.target_profile_id)
        )
        or exists (
          select 1 from public.direct_conversations conversation
          where (conversation.participant_one_profile_id = p.id or conversation.participant_two_profile_id = p.id)
            and (
              public.owns_profile(conversation.participant_one_profile_id)
              or public.owns_profile(conversation.participant_two_profile_id)
            )
        )
      )
  );
$$;

commit;
