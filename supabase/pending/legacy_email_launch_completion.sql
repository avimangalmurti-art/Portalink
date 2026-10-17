-- REVIEW ONLY. UNAPPLIED. Install AFTER the two adult/Google candidates.
-- No signup/provider/hook/stage/cron setting changes, accounts, or data backfill.
begin;
create function public.legacy_email_launch_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.adult_launch_configuration; a uuid:=auth.uid(); methods jsonb; recent boolean;
begin
 if a is null or not exists(select 1 from auth.users where id=a and email_confirmed_at is not null) then
  raise exception 'Confirmed account required';
 end if;
 select * into c from public.adult_launch_configuration where singleton;
 if not c.approved or c.stage<>'public' or not c.public_legal_verified or not c.hook_verified
 or c.terms_version is null or c.privacy_version is null then
  return jsonb_build_object('status','unavailable');
 end if;
 if exists(select 1 from public.account_launch_receipts where account_id=a and country='US' and age_band='18+'
  and terms_version=c.terms_version and privacy_version=c.privacy_version) then
  return jsonb_build_object('status','ready','terms_version',c.terms_version,'privacy_version',c.privacy_version);
 end if;
 if exists(select 1 from public.profiles where account_id=a)
 or not exists(select 1 from auth.identities where user_id=a and provider='email')
 or exists(select 1 from auth.identities where user_id=a and provider<>'email') then
  return jsonb_build_object('status','unavailable');
 end if;
 -- JWT AMR is signed Auth data, not raw_user_meta_data or a browser timestamp.
 methods:=auth.jwt()->'amr';
 if jsonb_typeof(methods)='array' then
  select exists(select 1 from jsonb_array_elements(methods) m where m->>'method'='password'
   and case when m->>'timestamp' ~ '^[0-9]{1,12}$' then
    (m->>'timestamp')::numeric between extract(epoch from clock_timestamp())-600 and extract(epoch from clock_timestamp())
   else false end) into recent;
 end if;
 return jsonb_build_object('status',case when coalesce(recent,false) then 'required' else 'reauthenticate' end,
  'terms_version',c.terms_version,'privacy_version',c.privacy_version);
end $$;
revoke all on function public.legacy_email_launch_status() from public,anon,service_role,supabase_auth_admin;
grant execute on function public.legacy_email_launch_status() to authenticated;

create function public.complete_legacy_email_launch(p_expected_account uuid,p_country text,p_birth_date text,p_terms_version text,p_privacy_version text,
 p_terms_accepted boolean,p_privacy_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); s jsonb; birth date; today date:=(clock_timestamp() at time zone 'UTC')::date;
begin
 if a is null or p_expected_account is distinct from a then raise exception 'Confirmed account required'; end if;
 -- Serialize retries for this authenticated account; no supplied account ID.
 perform 1 from auth.users where id=a and email_confirmed_at is not null for update;
 if not found then raise exception 'Confirmed account required'; end if;
 perform 1 from public.adult_launch_configuration where singleton for share;
 s:=public.legacy_email_launch_status();
 if s->>'status' not in ('required','ready') or s->>'status' is null then raise exception 'Completion unavailable'; end if;
 if p_country is distinct from 'US' or p_terms_accepted is distinct from true or p_privacy_acknowledged is distinct from true
 or p_terms_version is distinct from s->>'terms_version' or p_privacy_version is distinct from s->>'privacy_version'
 then raise exception 'Fresh eligibility and agreements required'; end if;
 if p_birth_date is null or p_birth_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Adult eligibility required'; end if;
 begin birth:=p_birth_date::date; exception when others then raise exception 'Adult eligibility required'; end;
 if birth<date '1900-01-01' or birth>today or birth>(today-interval '18 years')::date then raise exception 'Adult eligibility required'; end if;
 -- Never write DOB, credentials, browser times, or optional permissions.
 insert into public.account_launch_receipts(account_id,country,age_band,terms_version,privacy_version)
 values(a,'US','18+',p_terms_version,p_privacy_version)
 on conflict(account_id,terms_version,privacy_version) do nothing;
 return jsonb_build_object('verified',true);
end $$;
revoke all on function public.complete_legacy_email_launch(uuid,text,text,text,text,boolean,boolean) from public,anon,service_role,supabase_auth_admin;
grant execute on function public.complete_legacy_email_launch(uuid,text,text,text,text,boolean,boolean) to authenticated;
commit;
