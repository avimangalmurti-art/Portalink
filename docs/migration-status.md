# Migration status register

Recorded on 2026-09-14 from repository source at commit `5512bd0` and the evidence linked below. This documentation pass did not connect to a database, inspect a live migration ledger, apply SQL, or change deployment state.

There are **28 Supabase migration files**, one excluded account-deletion SQL candidate, and one separate Sites/D1 migration file. A file in Git establishes the intended change; it does not establish that a database received it. A successful isolated test establishes behavior in its synthetic database. A manual dashboard application record establishes a recorded application, but does not prove a migration-ledger entry or that the current schema still matches it.

See [current architecture](current-architecture.md), [development workflow](development-workflow.md), and [Sites deployment](sites-deployment.md) for the related application and release boundaries. Publishing the frontend or merging GitHub `main` does not apply Supabase migrations.

## Evidence and status vocabulary

| Status | Meaning in this register |
| --- | --- |
| Unknown | The file is present, but no explicit dated application record was found in the inspected repository. This does not mean unapplied. |
| Recorded manual application | A repository note explicitly records application through the hosted dashboard. Current schema and ledger remain unverified in this pass. |
| Recorded pending at an earlier date | A dated source note says the work was pending then. It is historical evidence, not a fresh production check. |
| Forward fix saved; application unverified | The correction exists in Git. Our permission-fix work did not apply it to production; out-of-band application has not been checked. |
| Excluded review candidate | Intentionally outside the migration directory and subject to a separate release gate. |

**Live Supabase migration-ledger status is unverified for every row below.** Neither chronological filenames nor the existence of later migrations proves that earlier files were applied.

## Supabase migration inventory

All filenames below are under `supabase/migrations/`.

| Migration file | Recorded application status | Evidence or follow-up |
| --- | --- | --- |
| [202608220001_creator_beta.sql](../supabase/migrations/202608220001_creator_beta.sql) | Unknown | Repository file; verify ledger and schema. |
| [202608220002_fix_profile_onboarding_rls.sql](../supabase/migrations/202608220002_fix_profile_onboarding_rls.sql) | Unknown | Repository file; verify ledger and policies. |
| [202608230001_content_sphere_discovery.sql](../supabase/migrations/202608230001_content_sphere_discovery.sql) | Unknown | Repository file; verify ledger and schema. |
| [202608230002_home_feed_mode.sql](../supabase/migrations/202608230002_home_feed_mode.sql) | Unknown | Repository file; verify ledger and schema. |
| [202608230003_product_loop_messages.sql](../supabase/migrations/202608230003_product_loop_messages.sql) | Unknown | Repository file; isolated messaging tests do not establish hosted application. |
| [202608240001_expand_project_media_limits.sql](../supabase/migrations/202608240001_expand_project_media_limits.sql) | Unknown | Repository file; compare with later limit changes and current Storage configuration. |
| [202608250001_pdf_processing_pipeline.sql](../supabase/migrations/202608250001_pdf_processing_pipeline.sql) | Unknown | [PDF worker instructions](../workers/pdf_processor/README.md) require this migration before worker startup; they are not an application receipt. |
| [202608250002_enforce_pdf_storage_ingestion.sql](../supabase/migrations/202608250002_enforce_pdf_storage_ingestion.sql) | Unknown | Repository file; verify ledger and ingestion triggers. |
| [202608250003_backfill_existing_pdfs.sql](../supabase/migrations/202608250003_backfill_existing_pdfs.sql) | Unknown | Repository file containing backfill work; do not infer execution from its presence. |
| [202608250004_defer_pdf_processing_until_claimed.sql](../supabase/migrations/202608250004_defer_pdf_processing_until_claimed.sql) | Unknown | Repository file; verify current queue functions and ledger. |
| [202608260001_set_project_upload_limit_250mb.sql](../supabase/migrations/202608260001_set_project_upload_limit_250mb.sql) | Unknown | Repository file; later limit migrations exist. |
| [202608260002_align_free_tier_upload_limit_50mb.sql](../supabase/migrations/202608260002_align_free_tier_upload_limit_50mb.sql) | Unknown | Repository file; later upload/storage changes exist. |
| [202608260003_scale_baseline_indexes.sql](../supabase/migrations/202608260003_scale_baseline_indexes.sql) | Unknown | Repository file; verify index catalog and ledger. |
| [202608280001_unbounded_project_descriptions.sql](../supabase/migrations/202608280001_unbounded_project_descriptions.sql) | Unknown | Repository file; verify current constraints and ledger. |
| [202609030001_defer_project_media_size_to_supabase.sql](../supabase/migrations/202609030001_defer_project_media_size_to_supabase.sql) | Unknown | Repository file; verify current constraints and Storage configuration. |
| [202609030002_multipart_project_originals.sql](../supabase/migrations/202609030002_multipart_project_originals.sql) | Unknown | [Large-file storage notes](large-file-storage.md) specify an application prerequisite; no dated application record was found. |
| [202609030003_prepend_new_profile_projects.sql](../supabase/migrations/202609030003_prepend_new_profile_projects.sql) | Unknown | Repository file; verify function definitions and ledger. |
| [202609030004_unbounded_publishing_descriptions.sql](../supabase/migrations/202609030004_unbounded_publishing_descriptions.sql) | Unknown | Repository file; verify function definitions and ledger. |
| [202609030005_private_creator_saves.sql](../supabase/migrations/202609030005_private_creator_saves.sql) | Unknown | Repository file; verify policies, function privileges, and ledger. |
| [202609050001_production_messaging.sql](../supabase/migrations/202609050001_production_messaging.sql) | Unknown | README deployment prerequisites and isolated messaging tests are not hosted application evidence. |
| [202609060001_message_request_permissions.sql](../supabase/migrations/202609060001_message_request_permissions.sql) | Unknown | Repository file; isolated permission tests do not establish hosted application. |
| [202609060002_instagram_message_controls.sql](../supabase/migrations/202609060002_instagram_message_controls.sql) | Unknown | Repository file; verify current function definitions and privileges. |
| [202609060003_project_cover_reposition.sql](../supabase/migrations/202609060003_project_cover_reposition.sql) | Unknown | [Image-repositioner notes](image-repositioner.md) describe isolated database validation, not production application. |
| [202609080001_optional_profile_headline.sql](../supabase/migrations/202609080001_optional_profile_headline.sql) | Unknown | Repository file; verify current constraints and ledger. |
| [202609080002_public_profile_appearance.sql](../supabase/migrations/202609080002_public_profile_appearance.sql) | Unknown | [Appearance notes](public-profile-appearance.md) describe isolated validation; no dated hosted application record was found. |
| [202609100001_video_processing_pipeline.sql](../supabase/migrations/202609100001_video_processing_pipeline.sql) | Recorded pending at an earlier date | [Video worker notes](../workers/video_processor/README.md) dated 2026-09-10 record migration/worker deployment as pending hosting. Current production installation is unknown. Original file was corrected in `5512bd0`; see the video section below. |
| [202609130001_private_content_boundary.sql](../supabase/migrations/202609130001_private_content_boundary.sql) | Recorded manual application | [September 13 implementation notes, activation items 1–2](apple-experience-audit-implementation.md#activation-order-and-remaining-limits) record authenticated dashboard application on 2026-09-13, matching six function bodies and live API checks. No ledger receipt is recorded here. |
| [202609140001_video_worker_permissions.sql](../supabase/migrations/202609140001_video_worker_permissions.sql) | Forward fix saved; application unverified | Added in `5512bd0`. Our permission-fix work applied no production SQL. Requires existing video functions; verify installation and current ACLs before scheduling application. |

The verification scripts under `scripts/` and database tests under `tests/` use synthetic schemas/accounts. For example, [the private-content verifier](../scripts/verify-private-content-database.mjs) loads the migration history into PGlite. Its success does not report the linked project's state.

## Video pipeline and permission correction

The September 10 [video worker README](../workers/video_processor/README.md) records deployment as pending separate worker hosting. Its statement that website publication was still pending is historical: the frontend has since been published. See [Sites deployment](sites-deployment.md) for the recorded live source. Frontend availability does not establish that video conversion is installed or running.

Commit `5512bd0` corrected the original video migration to revoke direct `anon` and `authenticated` function grants as well as `PUBLIC` grants. Supabase default function privileges can grant those browser roles execution directly; revoking only `PUBLIC` leaves that access in place. The original file now supports safe fresh installation.

For an existing installation of the earlier video migration, changing its file in Git does not alter the hosted functions. The separate [202609140001 forward migration](../supabase/migrations/202609140001_video_worker_permissions.sql) removes browser execution grants from the enqueue trigger and worker controls, retains the four worker RPCs for `service_role`, and restores the owner-checked retry RPC for `authenticated`. It changes permissions without backfilling jobs or changing uploaded files. It depends on the video functions already existing.

[The video database test](../tests/video-processing-db.test.mjs) models direct default grants and checks both fresh installation and forward repair. It checks function privileges, denies browser-role claims, permits a service-role claim in a rolled-back synthetic transaction, and retains owner/non-owner retry checks. These tests are not evidence of live ACLs.

Before any initial video activation, coordinate worker hosting with the queue/backfill migration. Applying `202609100001` can enqueue existing videos and mark unsupported ones as processing. A converter must be ready to consume that work. If the video functions already exist, assess the permission-only forward correction independently of worker provisioning; do not rerun the original backfill to repair privileges.

## Excluded account-deletion work

| Artifact | Status and boundary |
| --- | --- |
| [supabase/pending/account_deletion_safety.sql](../supabase/pending/account_deletion_safety.sql) | Excluded review candidate. [Account-deletion safety notes](account-deletion-safety.md) explicitly record it as not applied to production. This pass did not independently query production. |
| [supabase/pending/deletion-request.mjs](../supabase/pending/deletion-request.mjs) | Candidate request handler, not a migration. Its release gates remain disabled. |
| [supabase/pending/deletion-worker.mjs](../supabase/pending/deletion-worker.mjs) | Candidate worker, not a migration or deployment authorization. Its release gates remain disabled. |

**Account deletion must remain hard-disabled.** Keep the candidate outside `supabase/migrations/`. Enabling it requires the shared-conversation preservation and delayed, resumable deletion flow to be implemented, tested in a disposable integration environment, reviewed with the user, and explicitly approved for re-enabling. A migration audit, Git merge, deployment, or successful local test does not satisfy that release gate. Do not use real accounts or files as fixtures.

## Separate Sites/D1 migration

| Artifact | System | Application status |
| --- | --- | --- |
| [drizzle/0000_media_interactions.sql](../drizzle/0000_media_interactions.sql) | Sites worker's D1 database; creates media engagement/comment tables and indexes. | Unknown from this pass. It is outside the 28 Supabase files and outside the Supabase migration ledger. |

[The Sites worker](../src/sites-worker.ts) also has an `ensureSchema` routine that creates these tables and indexes when its database is used. Consequently, table existence alone would not prove that `0000_media_interactions.sql` ran through a migration tool. Verify D1's own deployment/migration records and catalog separately through the authorized Sites workflow. Do not send this SQLite/D1 SQL to Supabase.

## Proposed read-only verification

The following is an audit plan, not an instruction to apply changes automatically. Codex and Claude Code should share this register and assign one owner to each database change so that migration application and ledger reconciliation are coordinated.

1. **Confirm the target.** Match the existing Portalink Supabase project in the authenticated dashboard with local link metadata. This checkout has `supabase/.temp/linked-project.json`; it does not have `supabase/.temp/project-ref`. The link directory is ignored by Git and is not an application receipt. Do not copy credentials, tokens, database passwords, or environment files into this register.
2. **Read migration history.** In an authorized authenticated session, first check whether `supabase_migrations.schema_migrations` exists, then read its version list. An already installed, connected, authenticated CLI can alternatively run `supabase migration list --linked` after confirming the target. No CLI installation, login, linking, or remote call occurred in this documentation pass. No Supabase CLI executable was found on PATH or in this checkout's local dependencies during inventory.
3. **Compare actual schema.** Inspect the relevant relation, constraint, policy, trigger, and function catalogs without reading account/content rows. Compare function signatures and bodies to the reviewed migration and any later replacement. Give particular attention to the manually recorded September 13 changes and the existence of `video_processing_jobs` and its six control/trigger functions.
4. **Read effective function privileges.** For video functions that exist, inspect `has_function_privilege` for `anon`, `authenticated`, and `service_role`, plus the stored security-definer flag. Browser roles should not execute enqueue/claim/heartbeat/complete/fail controls; `authenticated` should retain the owner-checked retry RPC. Read catalogs rather than invoking claim, retry, or completion functions on live jobs as a permission test. Include default privileges in the audit so future function creation does not silently reopen access.
5. **Record separate conclusions.** For each file, record ledger presence, observed schema match or difference, dated evidence, verification method, and reviewing operator. A missing ledger row can coexist with a manually applied schema; a ledger row can coexist with later schema drift. Preserve those distinctions. Review mismatches before proposing any reconciliation.
6. **Prepare any changes separately.** Identify the exact reviewed migration and required deployment order. Neither `db push`, migration repair, nor reset is an automatic next step from this register. In particular, do not use a blanket push to discover which migrations are pending. Keep video worker/backfill coordination and the account-deletion hard lock intact.

Minimal read-only ledger queries, for a later authorized session:

```sql
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;
-- Run only if the relation above exists:
select version from supabase_migrations.schema_migrations order by version;
```

Record future verification results here without storing secrets or user data. Until that inspection occurs, the unknown and historically recorded statuses above remain deliberately unresolved.
