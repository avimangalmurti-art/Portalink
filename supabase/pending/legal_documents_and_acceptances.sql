-- Prepared for review. Apply only legal_documents_and_acceptances.sql after approval.
begin;
create table public.legal_documents (
  key text not null check(key in ('terms','privacy','content-licence','ai-access')),
  version text not null check(version ~ '^\d+\.\d+(\.\d+)?$'),
  title text not null,
  markdown_body text not null,
  effective_at timestamptz not null,
  primary key(key,version)
);
create table public.terms_acceptances (
  account_id uuid not null references auth.users(id),
  document_key text not null,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  primary key(account_id,document_key,version),
  foreign key(document_key,version) references public.legal_documents(key,version)
);
alter table public.legal_documents enable row level security;
alter table public.terms_acceptances enable row level security;
revoke all on public.legal_documents, public.terms_acceptances from public, anon, authenticated;
grant select on public.legal_documents to anon, authenticated;
grant select,insert on public.terms_acceptances to authenticated;
create policy effective_documents_read on public.legal_documents for select to anon, authenticated using(effective_at <= now());
create policy own_acceptances_read on public.terms_acceptances for select to authenticated using(account_id=(select auth.uid()));
create policy own_acceptances_insert on public.terms_acceptances for insert to authenticated with check(account_id=(select auth.uid()));

create function public.stamp_terms_acceptance()
returns trigger language plpgsql security definer set search_path='' as $$
declare latest_version text; headers jsonb; address text;
begin
  select version into latest_version from public.legal_documents
  where key=new.document_key and effective_at<=now()
  order by split_part(version,'.',1)::int desc, split_part(version,'.',2)::int desc,
    coalesce(nullif(split_part(version,'.',3),''),'0')::int desc limit 1;
  if latest_version is null or new.version<>latest_version then
    raise exception 'An agreement changed. Review the latest versions before continuing.' using errcode='23514';
  end if;
  headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  new.accepted_at := now();
  new.user_agent := left(headers->>'user-agent',512);
  address := nullif(split_part(headers->>'x-forwarded-for',',',1),'');
  -- Fresh server-only randomness prevents IP dictionary matching. No raw IP or
  -- reusable hashing secret is stored. This is an audit hint, not identity proof.
  new.ip_hash := case when address is null then null else
    encode(extensions.digest(gen_random_uuid()::text || address,'sha256'),'hex') end;
  return new;
end;
$$;
revoke all on function public.stamp_terms_acceptance() from public,anon,authenticated;
create trigger stamp_terms_acceptance before insert on public.terms_acceptances for each row execute function public.stamp_terms_acceptance();

insert into public.legal_documents(key,version,title,markdown_body,effective_at) values
('terms','1.0','Portalink Terms of Service',$legal_body$PLEASE READ THESE AGREEMENTS (COLLECTIVELY “AGREEMENTS”) CAREFULLY BEFORE USING PORTALINK. BY CREATING AN ACCOUNT OR USING PORTALINK YOU ARE AGREEING TO BE BOUND BY THE TERMS OF THESE AGREEMENTS.

[DRAFT — not yet reviewed by counsel]

IF YOU DO NOT AGREE TO THE TERMS OF THESE AGREEMENTS, DO NOT CREATE AN ACCOUNT OR USE PORTALINK.

YOU OWN WHAT YOU MAKE. PORTALINK RECEIVES ONLY THE LICENCE IT NEEDS TO PROVIDE THE SERVICE UNDER YOUR CHOSEN VISIBILITY LEVEL.

## Your account

Keep your account information accurate and protect your password. Use Portalink responsibly and respect other people's work and privacy.

## Your work

Only upload work you own or have permission to share. You retain ownership of your work. Changing visibility changes future access under the Content Licence.

## Service availability

This placeholder does not set final service commitments, liability limits, cancellation rights or dispute terms. Those provisions require counsel's review before release.

## Changes

When an agreement has a new effective version, Portalink asks you to review and agree again before continuing.

## Account closure

Account deletion remains unavailable in the current product. This draft does not promise a deletion or grace-period feature that has not been implemented.
$legal_body$,'2026-10-12T00:00:00Z'),
('privacy','1.0','Privacy Policy',$legal_body$[DRAFT — not yet reviewed by counsel]

## Privacy Policy

This draft explains the information Portalink needs to operate your account and the choices you make when sharing work.

## Account information

Portalink processes your account email, profile details, uploaded work and interactions to provide the service. Agreement acceptance records include the agreed versions, time, user agent and an IP hash when server hashing is configured.

## Visibility

Private, Public and Citable work have different access permissions. Review the Content Licence before choosing a visibility level.

## Your choices

You can manage your profile, privacy choices and signed-in sessions using the existing controls. This placeholder requires counsel's review of retention, service providers, legal rights and contact details.
$legal_body$,'2026-10-12T00:00:00Z'),
('content-licence','1.0','Content Licence — Private, Public, Citable',$legal_body$[DRAFT — not yet reviewed by counsel]

## Content Licence

Every project has one of three levels. You choose it when you publish and can change it any time.

## Private

Only you. Nobody else can see it. Nothing is reproduced or retrieved. Not a Portalink licence of any kind.

## Public

People may view. Anyone with the link may view your work on Portalink. No reproduction and no AI retrieval are permitted. People may cite it inside Portalink; the citation links back to you.

## Citable

People and their AI tools may use single pages or images, with your name. Anyone may reproduce one page or image at a time in their own document, provided they keep your name, the title, the date and a link to the page. No training of AI models on your work. No bulk download. No resale. You can switch back to Public at any time; future retrieval stops, and existing copies remain subject to attribution.

## Ownership and attribution

You retain ownership of your work. The chosen permission does not allow removal of attribution or transfer ownership. This draft requires legal review before release.
$legal_body$,'2026-10-12T00:00:00Z'),
('ai-access','1.0','AI Access Terms',$legal_body$[DRAFT — not yet reviewed by counsel]

## AI Access Terms

AI access applies only to work you explicitly mark Citable.

## Allowed access

An AI tool may retrieve a single page or image and reproduce it with your name, title, date and a link to the original while Citable permission remains active.

## Restrictions

No training of AI models, bulk download or resale. Private and Public visibility do not grant AI retrieval or reproduction permission.

## Changes to permission

Switching back to Public stops future retrieval. Copies already obtained remain subject to attribution. This draft requires counsel's review of enforcement, responsibility and withdrawal terms.
$legal_body$,'2026-10-12T00:00:00Z');
commit;
