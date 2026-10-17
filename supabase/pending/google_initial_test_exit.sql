-- REVIEW ONLY. DATA-PRESERVING REVERSE TRANSACTION FOR THE FIRST TEST WINDOW ONLY.
-- Separate explicit SQL and Auth/provider-restoration approval REQUIRED.
-- NOT a public-release rollback. Never bypass the public-guard latch.
-- First: pause via the approved stage function, disable Google, close preview access.
-- An authorized operator must independently verify those external settings and
-- record never-public evidence before setting this same-session acknowledgment:
-- portalink.initial_test_exit = google-disabled-preview-closed-never-public
-- This acknowledgment is operator evidence, NOT automatic verification of Google settings.
begin;
do $$
declare c public.adult_launch_configuration;
begin
 if current_user<>'postgres' then raise exception 'Approved database owner required'; end if;
 if current_setting('portalink.initial_test_exit',true) is distinct from 'google-disabled-preview-closed-never-public' then
  raise exception 'Verified initial-test exit acknowledgment required';
 end if;
 select * into c from public.adult_launch_configuration where singleton for update;
 if not found or c.stage<>'paused' then raise exception 'Pause the initial test first'; end if;
 if c.public_guards_active or c.public_legal_verified then raise exception 'Public launch guard: initial-test restoration forbidden'; end if;
 -- No accounts, identities, receipts, projects or tester mappings are deleted.
 update public.adult_google_handoffs set phase='failed',verifier=null,nonce=null where phase not in ('completed','failed');
 perform public.cleanup_adult_google_handoffs();
 update public.adult_launch_configuration set stage='installed',approved=false,
  terms_version=null,privacy_version=null,hook_verified=false,google_handoff_verified=false,cleanup_verified=false where singleton;
end $$;
commit;
-- Then restore the captured Auth-hook baseline (no configured hook), separately approved.
-- Google MUST remain disabled. Existing email signup can resume under pre-test behavior.
-- Keep the public guard latch, schemas, receipts and accounts intact. Do not drop Cron.
-- The candidate frontend stays inaccessible; its launch capabilities are now false.
