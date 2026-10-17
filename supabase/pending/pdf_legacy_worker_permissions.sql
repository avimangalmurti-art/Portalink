-- REVIEW CANDIDATE ONLY. Apply separately after explicit SQL approval.
-- Narrow containment for the live legacy controls; not the v2 worker migration.
-- Observed definitions: 2026-10-17 UTC, existing Portalink project.
-- No function bodies, queue rows, files, owner retry, or default ACLs are changed.
begin;

do $guard$
declare
  target record;
  function_id regprocedure;
begin
  for target in select * from (values
    ('public.claim_pdf_processing_job(text,integer)', '082f748f47d0d7cfc52b27433b7a554a'),
    ('public.complete_pdf_processing_job(uuid,integer,jsonb)', '8afd0c4dcf89cbcaa005b39d9a52fdb9'),
    ('public.fail_pdf_processing_job(uuid,text,text,integer,boolean)', '4e4a542663bb09d4c783563d93b72ea5'),
    ('public.report_pdf_processing_progress(uuid,integer,integer)', 'eb1faadbdd3844e7b7cbb69b4237a24b')
  ) as expected(signature, definition_md5)
  loop
    function_id := to_regprocedure(target.signature);
    if function_id is null or md5(pg_get_functiondef(function_id)) is distinct from target.definition_md5 then
      raise exception 'Legacy PDF definition changed: %; stop and review', target.signature;
    end if;
  end loop;
end
$guard$;

revoke execute on function
  public.claim_pdf_processing_job(text,integer),
  public.complete_pdf_processing_job(uuid,integer,jsonb),
  public.fail_pdf_processing_job(uuid,text,text,integer,boolean),
  public.report_pdf_processing_progress(uuid,integer,integer)
from public, anon, authenticated;

grant execute on function
  public.claim_pdf_processing_job(text,integer),
  public.complete_pdf_processing_job(uuid,integer,jsonb),
  public.fail_pdf_processing_job(uuid,text,text,integer,boolean),
  public.report_pdf_processing_progress(uuid,integer,integer)
to service_role;

-- Verify effective privileges, including inherited PUBLIC grants.
do $verify$
declare
  signature text;
begin
  foreach signature in array array[
    'public.claim_pdf_processing_job(text,integer)',
    'public.complete_pdf_processing_job(uuid,integer,jsonb)',
    'public.fail_pdf_processing_job(uuid,text,text,integer,boolean)',
    'public.report_pdf_processing_progress(uuid,integer,integer)'
  ] loop
    if has_function_privilege('anon',signature,'EXECUTE')
      or has_function_privilege('authenticated',signature,'EXECUTE')
      or not has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'Legacy PDF privilege postcondition failed: %', signature;
    end if;
  end loop;
end
$verify$;

commit;
