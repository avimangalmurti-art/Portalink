-- REVIEW ONLY; apply AFTER adult_launch_review.sql only with separate SQL approval.
-- No provider, domain, worker secret or Auth-hook configuration is applied here.
begin;
alter table public.adult_launch_configuration add column google_handoff_verified boolean not null default false;
create table public.adult_google_handoffs (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 browser_hash text not null check(browser_hash ~ '^[a-f0-9]{64}$'),
 verifier text, nonce text,
 terms_version text not null, privacy_version text not null,
 return_path text,
 phase text not null default 'pending' check(phase in ('pending','exchanging','identity_ready','account_bound','completed','failed')),
 google_subject text,
 account_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '10 minutes'
);
-- No DOB, email, IP, Google/Supabase access tokens, refresh tokens or raw state.
alter table public.adult_google_handoffs enable row level security;
revoke all on public.adult_google_handoffs from public,anon,authenticated;
create unique index adult_google_ready_subject on public.adult_google_handoffs(google_subject) where phase='identity_ready';
create index adult_google_expiry on public.adult_google_handoffs(expires_at);

create function public.adult_google_policy() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',approved and (stage='testing' or (stage='public' and public_legal_verified and hook_verified and google_handoff_verified and cleanup_verified)) and terms_version is not null and privacy_version is not null,
 'terms_version',terms_version,'privacy_version',privacy_version) from public.adult_launch_configuration where singleton
$$;

create function public.assert_adult_google_policy(p_terms text,p_privacy text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.adult_launch_configuration where singleton and approved and (stage='testing' or (stage='public' and public_legal_verified and hook_verified and google_handoff_verified and cleanup_verified))
 and terms_version=p_terms and privacy_version=p_privacy) then raise exception 'Google launch unavailable'; end if;
end $$;

-- Operational evidence only: no account or protocol values.
create table public.adult_google_cleanup_status (
 singleton boolean primary key default true check(singleton),
 last_success_at timestamptz, removed_count bigint not null default 0
);
insert into public.adult_google_cleanup_status(singleton) values(true);
alter table public.adult_google_cleanup_status enable row level security;
revoke all on public.adult_google_cleanup_status from public,anon,authenticated,service_role;

-- REVIEW ONLY: scheduler installation is a separate explicitly approved action.
create function public.cleanup_adult_google_handoffs() returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.adult_google_handoffs where expires_at<=clock_timestamp() or phase in ('completed','failed');
 get diagnostics removed=row_count;
 update public.adult_google_cleanup_status set last_success_at=clock_timestamp(),removed_count=removed where singleton;
 return removed;
end $$;
revoke all on function public.cleanup_adult_google_handoffs() from public,anon,authenticated;
grant execute on function public.cleanup_adult_google_handoffs() to service_role;

-- Owner-only stage transitions. Flags are evidence, never set automatically.
create function public.set_adult_launch_stage(p_stage text) returns void language plpgsql security definer set search_path='' as $$
declare c public.adult_launch_configuration;
begin
 select * into c from public.adult_launch_configuration where singleton for update;
 if p_stage not in ('installed','testing','public','paused') or p_stage is null then raise exception 'Invalid stage'; end if;
 if p_stage='installed' and c.stage<>'installed' then raise exception 'Use paused recovery'; end if;
 if p_stage in ('testing','public') and (not c.approved or c.terms_version is null or c.privacy_version is null) then raise exception 'Reviewed versions required'; end if;
 if p_stage='testing' and not exists(select 1 from public.adult_launch_testers) then raise exception 'Test identities required'; end if;
 if p_stage='public' and not exists(select 1 from public.adult_google_cleanup_status where last_success_at>clock_timestamp()-interval '5 minutes') then raise exception 'Recent cleanup proof required'; end if;
 if p_stage='public' and (c.stage<>'testing' or not c.public_legal_verified or not c.hook_verified or not c.google_handoff_verified or not c.cleanup_verified) then raise exception 'Verified testing and cleanup required'; end if;
 update public.adult_launch_configuration set stage=p_stage,
 public_guards_active=public_guards_active or p_stage='public',
 hook_verified=case when p_stage='paused' then false else hook_verified end,
 google_handoff_verified=case when p_stage='paused' then false else google_handoff_verified end where singleton;
 -- Every transition invalidates unfinished attempts and erases their secrets.
 update public.adult_google_handoffs set phase='failed',verifier=null,nonce=null where phase not in ('completed','failed');
 perform public.cleanup_adult_google_handoffs();
end $$;
revoke all on function public.set_adult_launch_stage(text) from public,anon,authenticated,service_role,supabase_auth_admin;

create function public.begin_adult_google_handoff(p_state_hash text,p_browser_hash text,p_verifier text,p_nonce text,p_terms_version text,p_privacy_version text,p_return_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.assert_adult_google_policy(p_terms_version,p_privacy_version);
 if p_verifier !~ '^[A-Za-z0-9_-]{43}$' or p_nonce !~ '^[A-Za-z0-9_-]{43}$' or p_verifier is null or p_nonce is null then raise exception 'Invalid handoff'; end if;
 -- Serialize same-browser starts so concurrent requests cannot evade the throttle.
 perform pg_advisory_xact_lock(hashtextextended(p_browser_hash,0));
 -- Opportunistic cleanup supplements the separately reviewed scheduler.
 perform public.cleanup_adult_google_handoffs();
 if exists(select 1 from public.adult_google_handoffs where browser_hash=p_browser_hash and created_at>clock_timestamp()-interval '10 seconds') then raise exception 'Try again later'; end if;
 if (select count(*) from public.adult_google_handoffs)>=10000 then raise exception 'Try again later'; end if;
 insert into public.adult_google_handoffs(state_hash,browser_hash,verifier,nonce,terms_version,privacy_version,return_path)
 values(p_state_hash,p_browser_hash,p_verifier,p_nonce,p_terms_version,p_privacy_version,p_return_path);
 return '{}'::jsonb;
end $$;

create function public.claim_adult_google_handoff(p_state_hash text,p_browser_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.adult_google_handoffs;
begin
 select * into h from public.adult_google_handoffs where state_hash=p_state_hash and browser_hash=p_browser_hash and phase='pending' and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Invalid handoff'; end if;
 perform public.assert_adult_google_policy(h.terms_version,h.privacy_version);
 update public.adult_google_handoffs set phase='exchanging' where state_hash=p_state_hash;
 return jsonb_build_object('verifier',h.verifier,'nonce',h.nonce,'return_path',h.return_path);
end $$;

create function public.authorize_adult_google_identity(p_state_hash text,p_browser_hash text,p_subject text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.adult_google_handoffs;
begin
 if p_subject is null or p_subject !~ '^[A-Za-z0-9_-]{1,255}$' then raise exception 'Invalid identity'; end if;
 select * into h from public.adult_google_handoffs where state_hash=p_state_hash and browser_hash=p_browser_hash and phase='exchanging' and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Invalid handoff'; end if;
 perform public.assert_adult_google_policy(h.terms_version,h.privacy_version);
 if exists(select 1 from public.adult_launch_configuration where stage='testing') and not exists(select 1 from public.adult_launch_testers where google_subject=p_subject) then raise exception 'Test identity not allowed'; end if;
 -- Expired identity-ready rows cannot monopolize the unique subject slot.
 update public.adult_google_handoffs set phase='failed',verifier=null,nonce=null where google_subject=p_subject and phase='identity_ready' and expires_at<=clock_timestamp();
 update public.adult_google_handoffs set google_subject=p_subject,phase='identity_ready',verifier=null,nonce=null where state_hash=p_state_hash;
 return '{}'::jsonb;
end $$;

create or replace function public.adult_launch_before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg public.adult_launch_configuration; a jsonb; h public.adult_google_handoffs; subject text;
begin
 select * into cfg from public.adult_launch_configuration where singleton;
 if cfg.stage='installed' then return '{}'::jsonb; end if;
 if cfg.stage='paused' then return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Registration paused.')); end if;
 if (cfg.stage='public' and not cfg.public_legal_verified) or not cfg.approved or cfg.terms_version is null or cfg.privacy_version is null then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Registration unavailable.'));
 end if;
 if event->'user'->'app_metadata'->>'provider'='google' and (cfg.stage='testing' or (cfg.stage='public' and cfg.hook_verified and cfg.google_handoff_verified and cfg.cleanup_verified)) then
  -- Supabase derives sub from the VERIFIED Google token. Never use email as identity.
  subject := event->'user'->'user_metadata'->>'sub';
  select * into h from public.adult_google_handoffs where google_subject=subject and phase='identity_ready' and expires_at>clock_timestamp()
   and terms_version=cfg.terms_version and privacy_version=cfg.privacy_version for update;
  if found and (cfg.stage='public' or exists(select 1 from public.adult_launch_testers where google_subject=subject)) then
   if cfg.stage='testing' then if not exists(select 1 from public.adult_launch_testers where google_subject=subject and (account_id is null or account_id=(event->'user'->>'id')::uuid)) then return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Test account mismatch.')); end if; end if;
   insert into public.account_launch_receipts(account_id,country,age_band,terms_version,privacy_version,terms_accepted_at,privacy_acknowledged_at)
   values((event->'user'->>'id')::uuid,'US','18+',h.terms_version,h.privacy_version,h.created_at,h.created_at)
   on conflict(account_id,terms_version,privacy_version) do nothing;
   update public.adult_google_handoffs set phase='account_bound',account_id=(event->'user'->>'id')::uuid where state_hash=h.state_hash;
   return '{}'::jsonb;
  end if;
 elsif cfg.stage='public' and cfg.hook_verified and event->'user'->'app_metadata'->>'provider'='email' then
  a := event->'user'->'user_metadata'->'portalink_launch';
  if a->>'country'='US' and a->>'ageBand'='18+' and a->>'termsVersion'=cfg.terms_version and a->>'privacyVersion'=cfg.privacy_version then
   insert into public.account_launch_receipts(account_id,country,age_band,terms_version,privacy_version)
   values((event->'user'->>'id')::uuid,'US','18+',cfg.terms_version,cfg.privacy_version)
   on conflict(account_id,terms_version,privacy_version) do nothing;
   return '{}'::jsonb;
  end if;
 end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Reviewed US adult eligibility and agreements required.'));
end $$;

create function public.finish_adult_google_handoff(p_state_hash text,p_browser_hash text,p_account_id uuid,p_subject text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.adult_google_handoffs;
begin
 select * into h from public.adult_google_handoffs where state_hash=p_state_hash and browser_hash=p_browser_hash and google_subject=p_subject
 and phase in ('identity_ready','account_bound') and expires_at>clock_timestamp() for update;
 if not found or (h.account_id is not null and h.account_id<>p_account_id) then raise exception 'Invalid handoff'; end if;
 perform public.assert_adult_google_policy(h.terms_version,h.privacy_version);
 if not exists(select 1 from auth.users u join auth.identities i on i.user_id=u.id where u.id=p_account_id and u.email_confirmed_at is not null
 and i.provider='google' and i.provider_id=p_subject) then raise exception 'Identity mismatch'; end if;
 if exists(select 1 from public.adult_launch_configuration where stage='testing') then
  update public.adult_launch_testers set account_id=p_account_id where google_subject=p_subject and (account_id is null or account_id=p_account_id);
  if not found then raise exception 'Test identity not allowed'; end if;
 end if;
 -- Returning users do not run Before User Created. Their receipt is bound here,
 -- after server verification, to the same confirmed Google-linked account.
 insert into public.account_launch_receipts(account_id,country,age_band,terms_version,privacy_version,terms_accepted_at,privacy_acknowledged_at)
 values(p_account_id,'US','18+',h.terms_version,h.privacy_version,h.created_at,h.created_at)
 on conflict(account_id,terms_version,privacy_version) do nothing;
 update public.adult_google_handoffs set phase='completed',account_id=p_account_id,verifier=null,nonce=null where state_hash=p_state_hash;
 return '{}'::jsonb;
end $$;

create function public.fail_adult_google_handoff(p_state_hash text,p_browser_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.adult_google_handoffs set phase='failed',verifier=null,nonce=null where state_hash=p_state_hash and browser_hash=p_browser_hash and phase not in ('completed','failed');
 return '{}'::jsonb;
end $$;

-- Verified receipt lookup is account-bound; a Google profile has no browser-supplied
-- portalink_launch metadata. Email retains its separate immutable hook receipt.
create function public.verify_adult_launch_receipt(p_terms_version text,p_privacy_version text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 or not exists(select 1 from public.adult_launch_configuration where singleton and approved and (stage='public' and public_legal_verified and hook_verified or stage='testing' and exists(select 1 from public.adult_launch_testers where account_id=auth.uid())) and terms_version=p_terms_version and privacy_version=p_privacy_version)
 or not exists(select 1 from public.account_launch_receipts where account_id=auth.uid() and country='US' and age_band='18+' and terms_version=p_terms_version and privacy_version=p_privacy_version)
 then raise exception 'Confirmed launch receipt required'; end if;
 return jsonb_build_object('verified',true);
end $$;

revoke all on function public.adult_google_policy(), public.assert_adult_google_policy(text,text), public.begin_adult_google_handoff(text,text,text,text,text,text,text),
 public.claim_adult_google_handoff(text,text), public.authorize_adult_google_identity(text,text,text), public.finish_adult_google_handoff(text,text,uuid,text),
 public.fail_adult_google_handoff(text,text) from public,anon,authenticated;
grant execute on function public.adult_google_policy(), public.begin_adult_google_handoff(text,text,text,text,text,text,text), public.claim_adult_google_handoff(text,text),
 public.authorize_adult_google_identity(text,text,text), public.finish_adult_google_handoff(text,text,uuid,text), public.fail_adult_google_handoff(text,text) to service_role;
revoke all on function public.verify_adult_launch_receipt(text,text) from public,anon;
grant execute on function public.verify_adult_launch_receipt(text,text) to authenticated;
-- Replacement retains prior hook grants; reassert the intended boundary.
revoke all on function public.adult_launch_before_user_created(jsonb) from public,anon,authenticated;
grant execute on function public.adult_launch_before_user_created(jsonb) to supabase_auth_admin;
commit;
