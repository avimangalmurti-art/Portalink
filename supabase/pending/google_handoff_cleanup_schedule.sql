-- REVIEW ONLY. Separate operational migration: NEVER apply with installation implicitly.
-- Requires existing pg_cron, owner review, and separate scheduling approval.
begin;
do $$
begin
 if not exists(select 1 from pg_extension where extname='pg_cron') then
  raise exception 'Existing pg_cron required; review an alternative scheduler separately';
 end if;
 if exists(select 1 from cron.job where jobname='portalink-google-handoff-cleanup') then
  raise exception 'Cleanup job already exists; inspect it instead of replacing it';
 end if;
 perform cron.schedule('portalink-google-handoff-cleanup','* * * * *','select public.cleanup_adult_google_handoffs()');
end $$;
commit;
-- Recovery: inspect job ID by this exact jobname; unschedule only that approved ID.
-- Do not unschedule cleanup just because sign-in is paused: expired rows still need purging.
-- Installing this job never sets cleanup_verified or activates registration.
