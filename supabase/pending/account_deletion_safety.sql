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

-- Match Portalink's existing String.trim().toLowerCase() email inputs,
-- including the ECMAScript whitespace set. Do not rewrite plus/dot aliases.
create function deletion_private.normalized_email(value text) returns text
language sql immutable as $$
  select nullif(lower(btrim(value, E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
    chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))), '');
$$;

-- Deliberately no FK to auth.users/profiles: recovery checkpoints and upload
-- fences must outlive those rows, including an uncertain Auth response.
create table deletion_private.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  profile_id uuid,
  project_ids uuid[] not null default '{}',
  email_reservation_required boolean not null default false,
  status text not null default 'deleting' check(status in ('deleting','completed')),
  phase text not null default 'storage' check(phase in ('storage','anonymize','d1','auth','complete')),
  d1_manifest_hash text check(d1_manifest_hash ~ '^[0-9a-f]{64}$'),
  d1_completed_at timestamptz,
  requested_at timestamptz not null default now(),
  irreversible_started_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error text
);
create unique index one_account_deletion on deletion_private.jobs(account_id);
create index ready_account_deletions on deletion_private.jobs(requested_at) where status='deleting';
create table deletion_private.files (
  job_id uuid not null references deletion_private.jobs(id) on delete restrict,
  bucket text not null check(bucket in ('avatars','project-media','message-media','project-covers')),
  path text not null,
  removed_at timestamptz,
  primary key(job_id,bucket,path)
);
-- The email is held independently of Auth and removed only by a confirmed
-- completion. No email address is retained in the durable completed job.
create table deletion_private.email_reservations (
  email_key text primary key check(deletion_private.normalized_email(email_key) is not null and email_key=deletion_private.normalized_email(email_key)),
  account_id uuid not null,
  job_id uuid not null unique references deletion_private.jobs(id) on delete restrict,
  reserved_at timestamptz not null default now()
);
-- Capabilities are minted before consent is submitted so a lost destructive
-- response remains recoverable. Store only their digests, never raw receipts.
-- Operator-configured expiry and purge eligibility are explicit per receipt.
create table deletion_private.receipts (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null,
  job_id uuid references deletion_private.jobs(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null check(expires_at>issued_at),
  purge_after timestamptz not null check(purge_after>=expires_at)
);
create index deletion_receipts_purge on deletion_private.receipts(purge_after);
create index deletion_receipts_account on deletion_private.receipts(account_id);
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

-- Deletion state lives only in the private, irreversible job. Protect durable
-- tombstone fields from browser writes without adding reversible row markers.
do $$ declare t text; cols text; begin
  foreach t in array array['profiles','portfolio_categories','projects','project_drafts','project_attachments','direct_messages','direct_message_attachments','project_comments'] loop
    -- Preserve existing per-column ACLs and expand only former table-wide grants.
    select string_agg(quote_ident(attname), ',') into cols from pg_attribute
      where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped
        and attname <> 'removed_at';
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

create function deletion_private.account_deleting(p_account uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from deletion_private.jobs where account_id=p_account);
$$;
create function deletion_private.profile_deleting(p_profile uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from deletion_private.jobs where profile_id=p_profile);
$$;
create function deletion_private.owns_path(j deletion_private.jobs, bucket text, path text) returns boolean
language sql immutable as $$
  select case bucket
    when 'avatars' then split_part(path,'/',1)=j.account_id::text
    when 'project-covers' then split_part(path,'/',1)=j.profile_id::text
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
    (select p.account_id from public.profiles p where bucket in ('project-media','message-media','project-covers') and (
      p.id::text=split_part(path,'/',1) or (bucket='project-media' and split_part(path,'/',1)='posts'
        and exists(select 1 from public.projects pr where pr.profile_id=p.id and pr.id::text=split_part(path,'/',2))))),
    (select j.account_id from deletion_private.jobs j where deletion_private.owns_path(j,bucket,path) limit 1)
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
    for j in select * from deletion_private.jobs loop
      if deletion_private.owns_path(j,old.bucket_id,old.name) and not (
        auth.role()='service_role' and j.status='deleting' and j.phase='storage' and j.lease_until>now()
        and (select worker_enabled from deletion_private.release_gate)
        and exists(select 1 from deletion_private.files f where f.job_id=j.id and f.bucket=old.bucket_id and f.path=old.name)
      ) then raise exception 'owner deleting: removal disabled'; end if;
    end loop;
    return old;
  end if;
  if tg_op='UPDATE' then
    for j in select * from deletion_private.jobs loop
      if deletion_private.owns_path(j,old.bucket_id,old.name) then raise exception 'owner deleting: move disabled'; end if;
    end loop;
  end if;
  if new.bucket_id='avatars' then
    begin owner_account:=split_part(new.name,'/',1)::uuid; exception when invalid_text_representation then owner_account:=null; end;
  elsif new.bucket_id in ('project-media','message-media','project-covers') then
    select p.account_id into owner_account from public.profiles p where
      p.id::text=split_part(new.name,'/',1) or (new.bucket_id='project-media' and split_part(new.name,'/',1)='posts'
        and exists(select 1 from public.projects pr where pr.profile_id=p.id and pr.id::text=split_part(new.name,'/',2)));
  end if;
  if owner_account is not null then perform pg_advisory_xact_lock(hashtextextended(owner_account::text,17)); end if;
  for j in select * from deletion_private.jobs loop
    if deletion_private.owns_path(j,new.bucket_id,new.name) then raise exception 'owner deleting: upload disabled'; end if;
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
  -- An UPDATE must not escape its old owner by assigning a surviving owner.
  for r in select value from jsonb_array_elements(case
    when tg_op='UPDATE' then jsonb_build_array(to_jsonb(old),to_jsonb(new))
    when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(new)) end) loop
    owner_account:=null; owner_profile:=null; owner_project:=null;
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
    if deletion_private.account_deleting(auth.uid()) or deletion_private.account_deleting(owner_account) or deletion_private.profile_deleting(owner_profile)
      or exists(select 1 from deletion_private.jobs j where owner_project=any(j.project_ids)) then raise exception 'account deleting'; end if;
  end loop;
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

-- Provider-facing boundary: a reserved email cannot be inserted or assigned to
-- another Auth identity while deletion is incomplete, even after Auth removal.
-- The same lock serializes duplicate-email insert/update races and completion.
create function deletion_private.fence_auth_email() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized_key text; old_key text; locked_key text;
begin
  normalized_key:=deletion_private.normalized_email(new.email);
  old_key:=case when tg_op='UPDATE' then deletion_private.normalized_email(old.email) else null end;
  if tg_op='INSERT' and deletion_private.account_deleting(new.id) then
    raise exception 'deleted account identifier cannot be reused';
  end if;
  if tg_op='UPDATE' and deletion_private.account_deleting(new.id) and new.email is distinct from old.email then
    raise exception 'account deleting: email change disabled';
  end if;
  for locked_key in select distinct k from unnest(array[old_key,normalized_key]) k where k is not null order by k loop
    perform pg_advisory_xact_lock(hashtextextended('email:'||locked_key,19));
  end loop;
  if normalized_key is null then return new; end if;
  if exists(select 1 from deletion_private.email_reservations r where r.email_key=normalized_key
    and (tg_op='INSERT' or r.account_id is distinct from new.id or old_key is distinct from normalized_key)) then
    raise exception using errcode='23505', message='email deletion has not completed';
  end if;
  if exists(select 1 from auth.users u where u.id<>new.id and deletion_private.normalized_email(u.email)=normalized_key) then
    raise exception using errcode='23505', message='email already in use';
  end if;
  return new;
end $$;
create trigger account_deletion_email_reservation before insert or update of email on auth.users
for each row execute function deletion_private.fence_auth_email();

-- Auth is the final irreversible provider operation. This also protects users
-- without public profiles; a profile cascade is not an adequate ordering guard.
create function deletion_private.fence_auth_delete() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(old.id::text,17));
  select * into j from deletion_private.jobs where account_id=old.id for update;
  if not coalesce((select worker_enabled from deletion_private.release_gate),false)
    or j.id is null or j.status<>'deleting' or j.phase<>'auth' or j.d1_completed_at is null or j.d1_manifest_hash is null
    or j.lease_token is null or j.lease_until is null or j.lease_until<=now() then
    raise exception 'account deletion lifecycle is not ready for Auth removal';
  end if;
  if j.email_reservation_required and not exists(select 1 from deletion_private.email_reservations r
    where r.job_id=j.id and r.account_id=j.account_id and r.email_key=deletion_private.normalized_email(old.email)) then
    raise exception 'email reservation missing';
  end if;
  if exists(select 1 from deletion_private.files where job_id=j.id and removed_at is null)
    or exists(select 1 from storage.objects o where deletion_private.owns_path(j,o.bucket_id,o.name)) then
    raise exception 'storage reconciliation incomplete';
  end if;
  return old;
end $$;
create trigger account_deletion_auth_last before delete on auth.users
for each row execute function deletion_private.fence_auth_delete();

-- Service-only RPCs receive identity and AMR evidence ONLY from the request
-- handler's getUser/getClaims verification of the same bearer token. Lock the
-- exact active session and recheck the five-minute window in this transaction.
create function deletion_private.require_recent_session(p_account_id uuid,p_session_id uuid,p_authenticated_at timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_authenticated_at is null or p_authenticated_at>now() or p_authenticated_at<now()-interval '5 minutes' then
    raise exception 'recent sign-in required';
  end if;
  perform 1 from auth.sessions where id=p_session_id and user_id=p_account_id
    and (not_after is null or not_after>now()) for share;
  if not found then raise exception 'active account session required'; end if;
end $$;
create function public.prepare_account_deletion_receipt(p_account_id uuid,p_session_id uuid,p_authenticated_at timestamptz,p_token_hash text,p_expires_at timestamptz,p_purge_after timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce((select requests_enabled from deletion_private.release_gate),false) then raise exception 'account deletion disabled'; end if;
  perform deletion_private.require_recent_session(p_account_id,p_session_id,p_authenticated_at);
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,17));
  if p_expires_at is null or p_purge_after is null or p_expires_at<=now() or p_purge_after<p_expires_at then raise exception 'receipt configuration required'; end if;
  delete from deletion_private.receipts where purge_after<=now();
  insert into deletion_private.receipts(token_hash,account_id,job_id,expires_at,purge_after)
    values(p_token_hash,p_account_id,(select id from deletion_private.jobs where account_id=p_account_id),p_expires_at,p_purge_after);
end $$;
create function public.account_deletion_receipt_status(p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r deletion_private.receipts; j deletion_private.jobs; complete boolean;
begin
  delete from deletion_private.receipts where purge_after<=now();
  select * into r from deletion_private.receipts where token_hash=p_token_hash and expires_at>now();
  if r.token_hash is null then return '{}'::jsonb; end if;
  if r.job_id is null then return jsonb_build_object('status','none','isDeleted',false); end if;
  select * into j from deletion_private.jobs where id=r.job_id and account_id=r.account_id;
  if j.id is null then return '{}'::jsonb; end if;
  complete:=j.status='completed' and j.phase='complete' and j.completed_at is not null;
  return jsonb_build_object('status',case when complete then 'completed' else 'processing' end,'isDeleted',complete);
end $$;
create function public.request_account_deletion(p_account_id uuid,p_session_id uuid default null,p_authenticated_at timestamptz default null,p_receipt_hash text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; p uuid; email_key text; r deletion_private.receipts;
begin
  if not coalesce((select requests_enabled from deletion_private.release_gate),false) then raise exception 'account deletion disabled'; end if;
  perform deletion_private.require_recent_session(p_account_id,p_session_id,p_authenticated_at);
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,17));
  select * into r from deletion_private.receipts where token_hash=p_receipt_hash and account_id=p_account_id and expires_at>now() for update;
  if r.token_hash is null then raise exception 'valid deletion receipt required'; end if;
  select * into j from deletion_private.jobs where account_id=p_account_id for update;
  if j.id is not null then
    if r.job_id is not null and r.job_id<>j.id then raise exception 'valid deletion receipt required'; end if;
    update deletion_private.receipts set job_id=j.id where account_id=p_account_id and job_id is null;
    return jsonb_build_object('id',j.id,'status',case when j.status='completed' then 'completed' else 'processing' end,'isDeleted',j.status='completed');
  end if;
  if r.job_id is not null then raise exception 'valid deletion receipt required'; end if;
  select deletion_private.normalized_email(email) into email_key from auth.users where id=p_account_id for update;
  if not found then raise exception 'account not found'; end if;
  if email_key is not null then perform pg_advisory_xact_lock(hashtextextended('email:'||email_key,19)); end if;
  select id into p from public.profiles where account_id=p_account_id for update;
  insert into deletion_private.jobs(account_id,profile_id,project_ids,email_reservation_required)
    values(p_account_id,p,array(select id from public.projects where profile_id=p),email_key is not null) returning * into j;
  if email_key is not null then
    insert into deletion_private.email_reservations(email_key,account_id,job_id) values(email_key,p_account_id,j.id);
  end if;
  update deletion_private.receipts set job_id=j.id where account_id=p_account_id and job_id is null;
  return jsonb_build_object('id',j.id,'status','processing','isDeleted',false);
end $$;
create function public.account_deletion_status(p_account_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select jsonb_build_object('id',id,'status',case when status='completed' then 'completed' else 'processing' end,'isDeleted',status='completed')
    from deletion_private.jobs where account_id=p_account_id),'{}'::jsonb);
$$;

create function public.claim_account_deletion(p_account_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs;
begin
  if not coalesce((select worker_enabled from deletion_private.release_gate),false) then raise exception 'account deletion worker disabled'; end if;
  select * into j from deletion_private.jobs where status='deleting' and (p_account_id is null or account_id=p_account_id)
    and (lease_until is null or lease_until<now()) order by requested_at,id for update skip locked limit 1;
  if j.id is null then return null; end if;
  update deletion_private.jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,last_error=null
    where id=j.id returning * into j;
  return to_jsonb(j);
end $$;

create function deletion_private.lock_job(p_job uuid,p_lease uuid) returns deletion_private.jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  if not coalesce((select worker_enabled from deletion_private.release_gate),false) then raise exception 'account deletion worker disabled'; end if;
  select * into j from deletion_private.jobs where id=p_job for update;
  if j.id is null or j.status<>'deleting' or p_lease is null or j.lease_token is null or j.lease_until is null
    or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'invalid deletion lease'; end if;
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
  if j.phase='d1' then return jsonb_build_object('phase','d1','manifest',jsonb_build_object('version',1,'jobId',j.id,'accountId',j.account_id,
    'ownedProjectIds',to_jsonb(array(select unnest(j.project_ids) order by 1)))); end if;
  if j.phase='auth' and (j.d1_completed_at is null or j.d1_manifest_hash is null) then raise exception 'D1 checkpoint required'; end if;
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
  if j.phase in ('d1','auth') then return; end if;
  if j.phase<>'anonymize' then raise exception 'storage must finish first'; end if;
  perform set_config('portalink.deletion_internal','on',true);
  update public.direct_message_attachments a set storage_path=null,file_name='Removed attachment',mime_type='application/octet-stream',removed_at=now()
    from public.direct_messages m where a.message_id=m.id and m.sender_profile_id=j.profile_id;
  update public.direct_messages set body='Message removed',sender_profile_id=null,removed_at=now(),edited_at=null
    where sender_profile_id=j.profile_id;
  update public.project_comments set body='Comment removed',author_profile_id=null,removed_at=now() where author_profile_id=j.profile_id;
  update public.direct_conversations set participant_one_profile_id=case when participant_one_profile_id=j.profile_id then null else participant_one_profile_id end,
    participant_two_profile_id=case when participant_two_profile_id=j.profile_id then null else participant_two_profile_id end,
    initiator_profile_id=case when initiator_profile_id=j.profile_id then null else initiator_profile_id end
    where j.profile_id in (participant_one_profile_id,participant_two_profile_id);
  -- Project/media rows are exclusive; delete them explicitly before categories
  -- (the category FK is RESTRICT). Shared messages are never deleted here.
  delete from public.projects where profile_id=j.profile_id;
  -- Owner chose immediate reuse. The unique current handle and all old aliases
  -- are released by profile deletion and its existing CASCADE; add no hold.
  delete from public.profiles where id=j.profile_id;
  update deletion_private.jobs set phase='d1' where id=j.id;
  perform set_config('portalink.deletion_internal','off',true);
end $$;
create function public.checkpoint_account_deletion_d1(p_job uuid,p_lease uuid,p_account_id uuid,p_project_ids uuid[],p_manifest_hash text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if p_account_id is distinct from j.account_id or p_project_ids is null
    or array(select unnest(p_project_ids) order by 1) is distinct from array(select unnest(j.project_ids) order by 1)
    or p_manifest_hash is null or p_manifest_hash !~ '^[0-9a-f]{64}$' then raise exception 'D1 checkpoint mismatch'; end if;
  if j.phase='auth' and j.d1_completed_at is not null and j.d1_manifest_hash=p_manifest_hash then return; end if;
  if j.phase<>'d1' then raise exception 'D1 checkpoint mismatch'; end if;
  update deletion_private.jobs set d1_manifest_hash=p_manifest_hash,d1_completed_at=now(),phase='auth' where id=j.id;
end $$;
create function public.finish_account_deletion(p_job uuid,p_lease uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j deletion_private.jobs; reserved_key text; begin
  j:=deletion_private.lock_job(p_job,p_lease);
  if j.phase<>'auth' or j.d1_completed_at is null or j.d1_manifest_hash is null or exists(select 1 from auth.users where id=j.account_id) then raise exception 'auth deletion not confirmed'; end if;
  if exists(select 1 from deletion_private.files where job_id=j.id and removed_at is null)
    or exists(select 1 from storage.objects o where deletion_private.owns_path(j,o.bucket_id,o.name)) then raise exception 'storage reconciliation incomplete'; end if;
  select email_key into reserved_key from deletion_private.email_reservations where job_id=j.id and account_id=j.account_id for update;
  if j.email_reservation_required and reserved_key is null then raise exception 'email reservation missing'; end if;
  if reserved_key is not null then perform pg_advisory_xact_lock(hashtextextended('email:'||reserved_key,19)); end if;
  update deletion_private.jobs set status='completed',phase='complete',completed_at=now(),lease_token=null,lease_until=null,last_error=null where id=j.id;
  delete from deletion_private.email_reservations where job_id=j.id;
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
      'prepare_account_deletion_receipt','account_deletion_receipt_status','request_account_deletion','account_deletion_status','claim_account_deletion',
      'account_deletion_batch','checkpoint_account_deletion_files','checkpoint_account_deletion_d1','anonymize_account_deletion','finish_account_deletion','fail_account_deletion')) loop
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
      and not deletion_private.profile_deleting(conversation.participant_one_profile_id)
      and not deletion_private.profile_deleting(conversation.participant_two_profile_id)
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
      where not exists(select 1 from public.projects owner_project where owner_project.id=expired.post_id and deletion_private.profile_deleting(owner_project.profile_id)) and expired.status = 'processing'
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
    where not exists(select 1 from public.projects owner_project where owner_project.id=j.post_id and deletion_private.profile_deleting(owner_project.profile_id)) and (
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
    where p.id = p_profile_id and (not deletion_private.profile_deleting(p.id) or p.account_id = (select auth.uid()))
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
