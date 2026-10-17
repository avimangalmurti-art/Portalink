# Legacy PDF permissions — approved correction applied

## Application receipt — 2026-10-17 06:34 UTC

The user explicitly approved this exact correction. It was executed once through the existing project's Supabase SQL editor, with the full editor selection checked byte-for-byte against the approved SQL after newline normalization. The editor returned **Success. No rows returned**. A separate read-only catalog query then confirmed all four functions deny EXECUTE to `anon` and `authenticated`, retain it for `service_role`, and retain their exact preflight definition hashes. `retry_pdf_processing(text)` retains its prior body and ACL. `supabase_migrations.schema_migrations` is still absent: no migration history was created or repaired. No processing RPC, queue mutation, or file operation was invoked for verification.

The executed source remains at [pdf_legacy_worker_permissions.sql](../supabase/pending/pdf_legacy_worker_permissions.sql) for review; its pending-directory location does not mean this exact permissions correction is still unapplied. All other pending PDF v2, video, auth and deletion work remains separate. Browser proof is in the release checkout's ignored `logs/launch-readiness/pdf-permissions-applied.jpg`.

Read-only catalog inspection on 2026-10-17 UTC found that `anon` and `authenticated` have effective EXECUTE on four SECURITY DEFINER PDF worker controls. Their live bodies do not check a worker role. The existing September 29 v2 safety migration remains unapplied; this correction does not activate that migration or a worker.

The proposed [permissions-only SQL](../supabase/pending/pdf_legacy_worker_permissions.sql) removes EXECUTE from PUBLIC, anon and authenticated for exactly these signatures, retaining service_role and owner access:

- `claim_pdf_processing_job(text,integer)`
- `complete_pdf_processing_job(uuid,integer,jsonb)`
- `fail_pdf_processing_job(uuid,text,text,integer,boolean)`
- `report_pdf_processing_progress(uuid,integer,integer)`

It does not change function bodies, data, queues, Storage, owner-checked `retry_pdf_processing(text)`, current workers, global default privileges, or other public RPCs. Exact live definition hashes guard against stale approval; effective-role postconditions abort the transaction if any browser grant remains. A worker that incorrectly uses a browser key would lose this unauthorized path; the supported service-role worker retains access.

Actual PostgreSQL role tests pass (5/5): stale-definition rejection without partial privilege changes, repeat application, unchanged bodies and queued row, browser invocation denied before mutation, and preserved service-role execution. Fixtures are synthetic and do not invoke live worker controls.

Apply only after explicit SQL approval in the existing Portalink project, then read back effective privileges and body hashes without claiming a job or changing a queue row. Do not apply other pending migrations. Before application, retain the catalog ACL snapshot. The observed prior ACL on each target was `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` with no PUBLIC grant. Restoring those prior browser grants would reopen the exposure and requires a separate decision; no automatic rollback is proposed.

Supabase's [function access advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) also lists intentionally public readers and trigger helpers. Do not revoke all SECURITY DEFINER functions indiscriminately. The remaining mutable-search-path warning concerns an invoker-only UUID parser; leaked-password protection is disabled. Those distinct findings are not silently changed by this candidate.

Status: this exact permissions correction is **applied and catalog-verified**. No evidence of abuse is asserted, and the audit did not inspect user content or invoke a processing operation.
