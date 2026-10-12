-- REVIEW ONLY. Separate activation after the application schema and worker.
-- No extension is enabled and no secret is created by this file.
-- Existing Supabase Cron, pg_net and Vault must be available first.
begin;
do $$
begin
 if to_regprocedure('cron.schedule(text,text,text)') is null or
    to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null or
    to_regclass('vault.decrypted_secrets') is null then
  raise exception 'Review and enable Cron, pg_net and Vault before scheduling';
 end if;
 if (select count(*) from vault.decrypted_secrets where name='studio_record_check_token' and char_length(decrypted_secret)>=32)<>1 then
  raise exception 'Set the private job token in Vault before scheduling';
 end if;
end $$;
select cron.schedule('portalink-profile-link-checks','*/5 * * * *', $job$
 select net.http_post(
  url := 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/api/studio/record/check-links',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
   (select decrypted_secret from vault.decrypted_secrets where name='studio_record_check_token')),
  body := '{}'::jsonb,
  timeout_milliseconds := 110000
 );
$job$);
commit;
