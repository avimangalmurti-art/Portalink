# Migration status register

The original register was recorded on 2026-09-14 from repository source at commit `5512bd0` and the evidence linked below; that documentation-only pass did not connect to a database or change deployment state. Later dated application records below are separate evidence.

Updated 2026-09-28 to record the approved application of six performance migrations to the existing Portalink Supabase project; the September 27 grid-density application remains recorded separately. There are **36 Supabase migration files**, one excluded account-deletion SQL candidate, and two separate Sites/D1 migration files. A file in Git establishes the intended change; it does not establish that a database received it. A successful isolated test establishes behavior in its synthetic database. A manual application record establishes that operation; only the specified catalog checks establish the observed schema, not a migration-ledger entry or all runtime behavior.

See [current architecture](current-architecture.md), [development workflow](development-workflow.md), and [Sites deployment](sites-deployment.md) for the related application and release boundaries. Publishing the frontend or merging GitHub `main` does not apply Supabase migrations.

## Evidence and status vocabulary

| Status | Meaning in this register |
| --- | --- |
| Unknown | The file is present, but no explicit dated application record was found in the inspected repository. This does not mean unapplied. |
| Recorded manual application | A repository note explicitly records application through the hosted dashboard. Current schema and ledger remain unverified in this pass. |
| Recorded application; catalog checks completed | The owning task records a successful approved transaction plus the specifically listed live catalog checks. This does not claim a migration-ledger entry or untested runtime behavior. |
| Recorded pending at an earlier date | A dated source note says the work was pending then. It is historical evidence, not a fresh production check. |
| Forward fix saved; application unverified | The correction exists in Git. Our permission-fix work did not apply it to production; out-of-band application has not been checked. |
| Excluded review candidate | Intentionally outside the migration directory and subject to a separate release gate. |
| Prepared locally; not applied | The current task prepared and tested the migration in isolation, but has not applied it to the existing Supabase project. |

The 2026-09-21 and 2026-09-28 catalog checks found no `supabase_migrations.schema_migrations` table in the existing project. No migration history was created or repaired. Historical application records below remain distinct; the Bio row records its separate manual application and verified schema result. Neither chronological filenames nor the existence of later migrations proves that earlier files were applied.

## Performance additions applied September 28, 2026

After explicit user approval, the owning task applied only these six new files to the existing Portalink Supabase project on 2026-09-28. **All six transactions succeeded.** Historical migrations were not replayed and the absent ledger was left unchanged. Website publication remains pending from v265, the approved D1 index awaits separate deployment verification, and media-worker changes remain source only. See [implementation and release status](performance-audit-status.md) and [read-path details](performance-read-paths.md).

| Migration | Purpose | Status |
| --- | --- | --- |
| [202609280001_performance_read_paths.sql](../supabase/migrations/202609280001_performance_read_paths.sql) | Read/foreign-key/lease indexes, safely parsed Storage paths, conditional indexed video lookup, selective multipart validation | Applied; non-video indexes, Storage policies and attachment triggers checked. Three video indexes/policy skipped because the job table is absent. |
| [202609280002_project_feed_pages.sql](../supabase/migrations/202609280002_project_feed_pages.sql) | RLS-preserving bounded Home/global cursor feed and cover metadata | Applied; transaction succeeded. Checked function bodies/metadata match reviewed source. |
| [202609280003_atomic_arrangement_engagement.sql](../supabase/migrations/202609280003_atomic_arrangement_engagement.sql) | Atomic owner arrangement saves and bounded visible-project engagement summaries | Applied; transaction succeeded. Checked function bodies/metadata match reviewed source. |
| [202609280004_scoped_message_activity.sql](../supabase/migrations/202609280004_scoped_message_activity.sql) | Participant-only private Realtime invalidation and state publication | Applied; activity SELECT/INSERT restrictions, retained typing restriction, triggers, state publication and RLS checked. |
| [202609280005_public_content_search.sql](../supabase/migrations/202609280005_public_content_search.sql) | Indexed bounded public profile/project search | Applied; transaction succeeded and search indexes ready. Checked function bodies/metadata match reviewed source. |
| [202609280006_messaging_read_identity.sql](../supabase/migrations/202609280006_messaging_read_identity.sql) | Statement-scoped viewer identity and equivalent messaging policies/summaries | Applied; 14 messaging policy definitions checked. Checked function bodies/metadata match reviewed source. |

Live post-checks confirmed 18 non-video indexes ready, four expected triggers correctly defined and enabled, and the definitions of 14 messaging policies plus three Storage policies. Realtime activity permits participant SELECT and has no client activity INSERT policy; the prior restricted typing policy remains. `direct_conversation_states` is published with RLS enabled. All 15 checked function bodies match reviewed source by MD5 after whitespace/comment normalization; security flags, search paths and explicitly specified ACLs also match. Existing participant/summary functions retain their prior anonymous EXECUTE grants (PUBLIC revoked, authenticated allowed). The identity and Realtime-version helpers are authenticated-only; the broadcaster denies browser execution.

The hosted `public.video_processing_jobs` table was confirmed absent. Migration `202609280001` conditionally skipped all three video indexes and its video policy replacement; it did not install the video pipeline or backfill jobs. The 19 focused read-path/database checks pass in isolation, including compatibility behavior. These catalog results do not establish an authenticated production feed/message/upload round trip. Index creation used ordinary transactions, not concurrent-index deployment. No historical migration or ledger repair ran.

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
| [202609100001_video_processing_pipeline.sql](../supabase/migrations/202609100001_video_processing_pipeline.sql) | Recorded pending at an earlier date; job table absent September 28 | [Video worker notes](../workers/video_processor/README.md) dated 2026-09-10 record migration/worker deployment as pending hosting. The 2026-09-28 live catalog check confirmed `public.video_processing_jobs` absent; this release did not install or backfill the pipeline. Original file was corrected in `5512bd0`; see the video section below. |
| [202609130001_private_content_boundary.sql](../supabase/migrations/202609130001_private_content_boundary.sql) | Recorded manual application | [September 13 implementation notes, activation items 1–2](apple-experience-audit-implementation.md#activation-order-and-remaining-limits) record authenticated dashboard application on 2026-09-13, matching six function bodies and live API checks. No ledger receipt is recorded here. |
| [202609140001_video_worker_permissions.sql](../supabase/migrations/202609140001_video_worker_permissions.sql) | Forward fix saved; application unverified | Added in `5512bd0`. Our permission-fix work applied no production SQL. Requires existing video functions; verify installation and current ACLs before scheduling application. |
| [202609210001_unbounded_profile_bio.sql](../supabase/migrations/202609210001_unbounded_profile_bio.sql) | Recorded manual application; schema verified | Applied by the owning Codex task on 2026-09-21 around 10:31 UTC through the authenticated SQL Editor for the existing Portalink Networks project after explicit user approval. Pre-check confirmed the 0–80 constraint. The transaction returned success; post-check confirmed zero `profiles_headline_check` constraints, `text`, NOT NULL, empty-string default and RLS still enabled. Only that constraint was dropped; no content rows were read/changed and no other migrations ran. Migration ledger table was absent and was not created. Isolated full-schema tests cover long/Unicode/empty Bios, preserved existing rows and denied non-owner writes. |
| [202609270001_profile_project_grid_columns.sql](../supabase/migrations/202609270001_profile_project_grid_columns.sql) | Recorded manual application; schema verified | Applied on 2026-09-27 through the authenticated SQL Editor of the existing Portalink Networks project after explicit approval to apply this single migration and publish. Pre-check found no density column and no migration ledger table. Exact transaction returned success; post-check confirmed `smallint`, NOT NULL, default 2, the 2–13 constraint, and profile RLS enabled. No order/profile content fields, grants or policies were rewritten; no other migration ran and no ledger was created/repaired. Isolated full-schema tests verify idempotency, defaults, range enforcement, retained data/order/policies/grants and public read versus non-owner write permissions. |

The verification scripts under `scripts/` and database tests under `tests/` use synthetic schemas/accounts. For example, [the private-content verifier](../scripts/verify-private-content-database.mjs) loads the migration history into PGlite. Its success does not report the linked project's state.

The focused [Bio database test](../tests/profile-bio-db.test.mjs) uses the existing isolated PGlite runtime via `PGLITE_MODULE_PATH`: set that environment variable to the installed runtime's `dist/index.js`, then run `node.exe --test tests/profile-bio-db.test.mjs`. It skips when the runtime is unavailable; it never connects to Supabase. The test also executes [profile onboarding SQL validation](../tests/profile-onboarding.sql) against a temporary table in that isolated database.

## Video pipeline and permission correction

The September 10 [video worker README](../workers/video_processor/README.md) records deployment as pending separate worker hosting. Its statement that website publication was still pending is historical: the frontend has since been published. See [Sites deployment](sites-deployment.md) for the recorded live source. The 2026-09-28 live catalog check confirmed the video job table absent, so the performance migration skipped its optional video branch. No video pipeline installation, backfill or media-worker deployment occurred in this release task.

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
| [drizzle/0000_media_interactions.sql](../drizzle/0000_media_interactions.sql) | Sites worker's D1 database; creates media engagement/comment tables and indexes. | Unknown from this pass. It is outside the Supabase files and outside the Supabase migration ledger. |
| [drizzle/0001_saved_media_read_index.sql](../drizzle/0001_saved_media_read_index.sql) | Existing Sites D1 database; adds the account/kind/time saved-page read index. | Explicitly approved September 28; packaged for Sites publication, application awaiting deployment verification. Isolated SQLite tests pass. A read-only Sites overview confirms the existing engagement/comment tables, not application of this index. |

Earlier versions of [the Sites worker](../src/sites-worker.ts), including live v265, used an `ensureSchema` routine to create these tables and indexes at runtime. The current performance source removes that routine and retains the existing tables/data. Consequently, table existence alone does not prove that `0000_media_interactions.sql` ran through a migration tool. Sites packages `drizzle/*.sql` for publication; verify D1 application through its deployment/migration evidence or live catalog before recording the approved index as applied. Do not send this SQLite/D1 SQL to Supabase.

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
