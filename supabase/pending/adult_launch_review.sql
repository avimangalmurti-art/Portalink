-- REVIEW ONLY. Not applied. Same existing Supabase project; no provider settings.
-- Apply only after explicit SQL approval. Legal versions intentionally unset.
-- Setting versions and activating the Auth hook are SEPARATE release actions.
begin;
create table public.adult_launch_configuration (
  singleton boolean primary key default true check(singleton),
  terms_version text,
  privacy_version text,
  approved boolean not null default false,
  hook_verified boolean not null default false,
  cleanup_verified boolean not null default false,
  public_legal_verified boolean not null default false,
  public_guards_active boolean not null default false,
  stage text not null default 'installed' check(stage in ('installed','testing','public','paused'))
);
insert into public.adult_launch_configuration(singleton) values(true);
alter table public.adult_launch_configuration enable row level security;
revoke all on public.adult_launch_configuration from public,anon,authenticated,service_role;

-- Owner-managed test identities; no browser or service-role writes.
create table public.adult_launch_testers (
 google_subject text primary key check(google_subject ~ '^[A-Za-z0-9_-]{1,255}$'),
 account_id uuid unique
);
alter table public.adult_launch_testers enable row level security;
revoke all on public.adult_launch_testers from public,anon,authenticated,service_role;

-- Database-side enforcement is dormant on install and scoped in testing.
create function public.adult_launch_enforced(p_account uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.adult_launch_configuration c where c.singleton and
 (c.public_guards_active or c.stage in ('public','paused') or (c.stage='testing' and exists(select 1 from public.adult_launch_testers t where t.account_id=p_account))))
$$;
revoke all on function public.adult_launch_enforced(uuid) from public,anon,authenticated;

create table public.account_launch_receipts (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null,
 country text not null check(country='US'),
 age_band text not null check(age_band='18+'),
 terms_version text not null,
 privacy_version text not null,
 terms_accepted_at timestamptz not null default now(),
 privacy_acknowledged_at timestamptz not null default now(),
 -- No birth date, password, token, IP address or optional permission stored here.
 recorded_at timestamptz not null default now(),
 unique(account_id,terms_version,privacy_version)
);
alter table public.account_launch_receipts enable row level security;
revoke all on public.account_launch_receipts from public,anon,authenticated;
grant select on public.account_launch_receipts to authenticated;
create policy launch_receipt_owner_read on public.account_launch_receipts for select to authenticated using(account_id=auth.uid());

-- Optional permissions are separate, append-only records. No grant flow is
-- enabled at launch. Default-off is NOT recorded as a person's consent/refusal.
create table public.account_optional_consent_events (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null,
 purpose text not null check(purpose in ('analytics','marketing_email','marketing_content')),
 granted boolean not null,
 notice_version text not null,
 recorded_at timestamptz not null default now()
);
alter table public.account_optional_consent_events enable row level security;
revoke all on public.account_optional_consent_events from public,anon,authenticated;
grant select on public.account_optional_consent_events to authenticated;
create policy optional_consent_owner_read on public.account_optional_consent_events for select to authenticated using(account_id=auth.uid());

create function public.adult_launch_policy() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',approved and (stage='testing' or (stage='public' and hook_verified and public_legal_verified)) and terms_version is not null and privacy_version is not null,
 'terms_version',terms_version,'privacy_version',privacy_version) from public.adult_launch_configuration where singleton
$$;
revoke all on function public.adult_launch_policy() from public;
grant execute on function public.adult_launch_policy() to anon,authenticated;

create function public.record_adult_launch(p_country text,p_age_band text,p_terms_version text,p_privacy_version text)
returns void language plpgsql security definer set search_path='' as $$
declare cfg public.adult_launch_configuration; claim jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select * into cfg from public.adult_launch_configuration where singleton;
 if cfg.stage<>'public' or not cfg.public_legal_verified or not cfg.approved or not cfg.hook_verified or cfg.terms_version is null or cfg.privacy_version is null then raise exception 'launch not approved'; end if;
 if p_country is distinct from 'US' or p_age_band is distinct from '18+' or p_terms_version is distinct from cfg.terms_version or p_privacy_version is distinct from cfg.privacy_version then raise exception 'invalid launch attestation'; end if;
 -- Uses the authenticated, confirmed account; no client-supplied account ID.
 select raw_user_meta_data->'portalink_launch' into claim from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if claim is null or claim->>'country' is distinct from p_country or claim->>'ageBand' is distinct from p_age_band or claim->>'termsVersion' is distinct from p_terms_version or claim->>'privacyVersion' is distinct from p_privacy_version then raise exception 'confirmed signup attestation required'; end if;
 if not exists(select 1 from public.account_launch_receipts where account_id=auth.uid() and country=p_country and age_band=p_age_band and terms_version=p_terms_version and privacy_version=p_privacy_version) then raise exception 'signup hook receipt required'; end if;
end $$;
revoke all on function public.record_adult_launch(text,text,text,text) from public;
grant execute on function public.record_adult_launch(text,text,text,text) to authenticated;

-- Supabase Before User Created hook. Must be configured explicitly after review.
-- New OAuth users without this attestation are intentionally rejected; Google
-- remains disabled until its admission handoff has a separate security review.
create function public.adult_launch_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.adult_launch_configuration; a jsonb;
begin
 select * into cfg from public.adult_launch_configuration where singleton;
 if cfg.stage='installed' then return '{}'::jsonb; end if;
 a := event->'user'->'user_metadata'->'portalink_launch';
 if cfg.stage='public' and cfg.public_legal_verified and cfg.approved and cfg.terms_version is not null and cfg.privacy_version is not null
 and a->>'country'='US' and a->>'ageBand'='18+'
 and a->>'termsVersion'=cfg.terms_version and a->>'privacyVersion'=cfg.privacy_version then
   -- The trusted Auth hook supplies the account ID; the server timestamps receipt.
   -- No browser timestamp or editable user metadata can forge a historical receipt.
   insert into public.account_launch_receipts(account_id,country,age_band,terms_version,privacy_version)
   values((event->'user'->>'id')::uuid,'US','18+',cfg.terms_version,cfg.privacy_version)
   on conflict(account_id,terms_version,privacy_version) do nothing;
   return '{}'::jsonb;
 end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Registration requires reviewed US adult eligibility and agreements.'));
end $$;
revoke all on function public.adult_launch_before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.adult_launch_before_user_created(jsonb) to supabase_auth_admin;

create function public.guard_adult_launch_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.adult_launch_enforced(new.account_id) then return new; end if;
 if not exists(select 1 from public.account_launch_receipts r join public.adult_launch_configuration c on c.singleton and c.approved and (c.stage='testing' or c.hook_verified) and c.terms_version=r.terms_version and c.privacy_version=r.privacy_version where r.account_id=new.account_id) then raise exception 'adult launch receipt required'; end if;
 new.is_private := true;
 return new;
end $$;
revoke all on function public.guard_adult_launch_profile() from public,anon,authenticated;
create trigger adult_launch_profile_insert before insert on public.profiles for each row execute function public.guard_adult_launch_profile();
-- Existing column defaults remain unchanged; activated triggers enforce privacy.

-- Existing content stays intact. Disable AI permission enforcement globally,
-- prevent granting it, and give newly inserted projects private defaults.
-- Clone the original body, preserving the original function OID for RLS/dependencies.
do $$ begin execute replace(pg_get_functiondef('public.is_project_citable(uuid)'::regprocedure),'FUNCTION public.is_project_citable(', 'FUNCTION public.is_project_citable_before_adult_launch('); end $$;
revoke all on function public.is_project_citable_before_adult_launch(uuid) from public,anon,authenticated;
create or replace function public.is_project_citable(p_project_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when public.adult_launch_enforced(auth.uid()) then false else public.is_project_citable_before_adult_launch(p_project_id) end
$$;
revoke all on function public.is_project_citable(uuid) from public;
grant execute on function public.is_project_citable(uuid) to anon,authenticated;
create function public.guard_adult_launch_project() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.adult_launch_enforced(auth.uid()) then return new; end if;
 if tg_op='INSERT' then
   if new.citation_permitted then raise exception 'AI permissions unavailable'; end if;
   new.is_hidden := true;
 elsif new.citation_permitted and new.citation_permitted is distinct from old.citation_permitted then raise exception 'AI permissions unavailable'; end if;
 return new;
end $$;
revoke all on function public.guard_adult_launch_project() from public,anon,authenticated;
create trigger adult_launch_project_write before insert or update on public.projects for each row execute function public.guard_adult_launch_project();
-- Preserve human citation resolution while closing the direct citable RPC.
do $$ begin execute replace(pg_get_functiondef('public.resolve_citation_item(text,boolean)'::regprocedure),'FUNCTION public.resolve_citation_item(', 'FUNCTION public.resolve_citation_item_before_adult_launch('); end $$;
revoke all on function public.resolve_citation_item_before_adult_launch(text,boolean) from public,anon,authenticated;
create or replace function public.resolve_citation_item(p_item_id text,p_require_citable boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item jsonb;
begin
 if not public.adult_launch_enforced(auth.uid()) then return public.resolve_citation_item_before_adult_launch(p_item_id,p_require_citable); end if;
 if p_require_citable then return null; end if;
 item := public.resolve_citation_item_before_adult_launch(p_item_id,false);
 if item is null then return null; end if;
 return jsonb_set(item,'{citable}','false'::jsonb);
end $$;
revoke all on function public.resolve_citation_item(text,boolean) from public;
grant execute on function public.resolve_citation_item(text,boolean) to anon,authenticated;
commit;
