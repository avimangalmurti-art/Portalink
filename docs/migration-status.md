<!-- 2026-10-12: Explicitly approved account_session_devices.sql applied once via existing production SQL Editor. Unchanged file recorded as 202610120001_account_session_devices.sql; no ledger repair. Schema/FK preflight, grants and rollback-only account isolation/selected revocation/cascade checks passed; real sessions untouched. Source publication tracked in agent-handoff. -->
<!-- 2026-10-07: 0003 applied once via approved production SQL Editor; citation/notification cascade lifecycle verified and test rows deleted. File moved unchanged to migrations; CLI ledger untouched. No publish; Studio acceptance issue remains. -->
<!-- 2026-10-07: 202610070001 and 202610070002 applied manually through production SQL Editor in order with explicit approval; October 6 backup selected. Files moved to migrations. CLI ledger unchanged. App acceptance incomplete; no publish. See agent-handoff.md. -->
<!-- October 1, 2026: 202610010001_profile_connection_counts.sql applied separately with explicit user approval. Existing Supabase project; transaction success, aggregate totals/execute grants/inaccessible-profile null and public REST RPC verified. No user rows or ledger changed; frontend remains unpublished. See agent-handoff.md. -->
<!-- 2026-10-12: immediate_account_session_revocation.sql is pending explicit approval. No SQL applied; adds active-session functions, guarded Data API pre-request hook and restrictive policies on31 inventoried RLS tables. See docs/immediate-session-revocation.md. -->
# Migration status register

## September 30, 2026 — Sites279 live; edge cache verified

### Sites279 publication and verified edge reuse

Published **Sites279** successfully at **2026-09-30 16:15:07 America/Los_Angeles (23:15:07 UTC)** from source `745fc4f22e0d849f7843b61b45d7039d6ce42a9c`; deployment `appgdep_6abd97f00a948191a48c314f9ccc980c`, saved version `appgprj_6a9273ef43f8819198e0878a0020ad91~appgver_d83bd322256c81918af0720769e96d41`. Existing public audience and runtime revision2 retained. Site source mirror updated; no GitHub push/merge.

**Live verification passed at23:15:16UTC:** representative200/400/800 covers,1200×630 social cover and a public avatar all returned repeated **HIT**, correct decoded dimensions/MIME, ETag, Vary:Accept and `public, max-age=31536000, immutable`. Cached HEAD returned200 without a body and conditional GET returned304 for all five objects. The400/800/social/avatar requests each demonstrated MISS then HIT; the200cover retained its earlier named-cache entry across deployments. Repeated samples took45–74ms here; these are command-line observations from one connection/edge, not physical-phone or worldwide first-paint measurements. Legacy avatars’300-second policy is covered by the focused tests; no legacy live-avatar check was needed.

UUID share redirects301 to `/portalite`; canonical handle and main shell200. Private media prefix404, malformed cover400, unauthenticated RUM/Reads summaries401. No invalid/private media object entered the cache.16 focused tests, typecheck, lint (0 errors /90 existing warnings), production client+worker build and independent read-only review passed. No further SQL, Storage, backfill, runtime or platform-trust changes. Existing media data is untouched.

The remaining Sites277 edge-cache issue is **resolved**. Named caches preserve Site isolation; cache-stage diagnostics contain no request URLs, headers, account details or upstream exception text. Publication archive matched the built worker and contained exactly unchanged approved D1 0000–0003, no pending/HOLD files. Archive SHA256:`3ee84b0b7c1642cb5a4ef839146d1e7cc4619812403d3af2d9df39a045a8a5f7`.

Receipts in ignored `logs/backend-activation-20260930/`: `deployment-278.json`, `deployment-279.json`, `cache-live-postflight-278.json` (intermediate header failure), `cache-live-postflight.json` (final success), `cache-final-archive-check.json`, `cache-fix-{tests,typecheck,lint,build}.log`. Only post-publication documentation is uncommitted. Older unresolved-cache notes below are historical and superseded by this receipt.

The user requested fixing and publishing the remaining edge-cache issue. `src/server/publicMedia.ts` now opens the isolated `portalink-public-media-v1` named cache and never accesses `caches.default`, which Cloudflare disables for untrusted Workers for Platforms namespaces. Public-cover/avatar path validation, Accept-specific keys, immutable/legacy-avatar headers, MIME checks, identity stripping and background `waitUntil` writes are preserved. Cache-open/read failures safely bypass; all cache-operation failures emit fixed stage-only diagnostics without input or exception details. No Storage, SQL, runtime configuration, namespace trust or visibility changes.

16 focused media tests pass, including a disabled-default-cache fixture, eventual named-cache hits for covers and avatars, injected-cache bypass, open/match/put failures, Accept isolation, HEAD/ETag, invalid paths and authentication stripping. Typecheck, lint (0 errors / 90 existing warnings) and production client+worker build pass. Independent read-only review found no blocker. Source changes are limited to the public-media worker, its tests and release-status documentation; existing user source/docs are preserved. Publishing uses the existing Sites project and active D1 migrations only, no GitHub push.

Sites278 (source55585c338996517ca35321287b4bdd3930aa040f) deployed at23:11:21UTC and proved a real200-cover MISS then HIT (360ms then55ms in this sample). Postflight caught the platform normalizing cached Cache-Control by stripping immutable. A focused correction now restores the validated object’s cache policy on every response, including hits, HEAD and304; a regression test also protects legacy avatars’300-second revalidation. All16 tests pass. The first receipt is preserved as cache-live-postflight-278.json; final corrected publication and complete live verification follow. No namespace trust/config, SQL or Storage changes.

## September 30, 2026 — Sites277 live; backfill complete; edge reuse unresolved

The approved Apply completed at **22:41:54 UTC**: **10 considered / 10 generated / 10 applied / 0 skipped / 0 failed**, 47,433 ms. Uploaded **40 new WebPs, 786,466 bytes**, no reused objects: 200/400/800 plus 1200×630 social per project. All 10 manifests and 40 decoded assets match their receipts. Storage now has 97 objects across 4 buckets; all 57 originals retain identity, path, size, ETag, MIME and cache metadata. Fresh read-only selection skips all 10 as already complete, with zero generation/writes. Do not repeat Apply.

Delivery verification stopped on small proxy covers (502), then identified an internal shared-shell redirect and an unsupported worker request option. Local fixes preserve transformed raster MIME (raw masters/social remain WebP), fetch the canonical internal `/share` asset, and replace worker `redirect: error` with `manual`, retaining rejection of all upstream redirects. The lookup correction also covers link previews, RUM owner verification and Reads. Permissions, visibility, configuration and originals are unchanged.

The user approved publication and live verification. **91 focused tests, typecheck, lint (0 errors / 90 existing warnings), and production client + worker build pass.** A built-worker Node harness with real anonymous reads passed UUID-to-handle 301, handle200, both crawler cards and three cover variants200. One prior metadata read timed out into the intended generic-shell fallback; the subsequent complete check passed. This is not native workerd/hosted evidence. Live cache HIT and physical-phone speed remain unverified. Sites277 is now active with runtime revision2; see the publication receipt below.

Evidence: ignored `logs/backend-activation-20260930/` with `backfill-release-*`, `cover-manifests-postflight.json`, `storage-postflight.json`, `backfill-readonly-postflight.json`, `delivery-diagnostic.json` and `delivery-fix-*`. The backup is the user's confirmed dashboard backup, not a local dump. Previously approved Supabase/Storage/D1/RUM activation remains applied. Deletion/PDF-processing HOLD items and SMTP are unchanged. Earlier retry notes below are historical and superseded by this record.

### Publication and live verification receipt

**Sites277** deployed successfully at **2026-09-30 23:00:57 UTC**, source `3116392422a71c7c5ba0077e9d693528fb99b5f6`, deployment `appgdep_6abd949f87bc8191b384c0ea447108ea`; runtime revision2 retained. Saved version `appgprj_6a9273ef43f8819198e0878a0020ad91~appgver_8ff76842354081919ff6cccaf51ab933`. Sites source mirror updated; no GitHub push/merge. Packaging required installed Git Bash on PATH and `TAR_OPTIONS=--force-local` for Windows drive paths; first two packaging attempts caused no deployment or source loss. Final archive matches built worker and contains exactly unchanged active D1 0000–0003, no pending/HOLD SQL. Archive SHA256: `10dfbc6ce16c9fe2289dc613de96d26199063dead6107253673c003d61db7d3c`.

Read-only hosted checks at23:01UTC: UUID share301 to `/portalite`; handle, project deep-link and main/Studio/Messages shells200; facebookexternalhit and LinkedInBot return `Portalite — Portfolio`,1200×630 creator metadata. Representative200/400 transformed JPEG,800WebP and1200×630socialWebP all200 with decoded expected geometry, ETag, Vary:Accept and immutable year cache headers. Guest RUM/Reads summaries remain401/no-store. Browser420×912 and1280×900: all10 actual cover `<img>` elements loaded successfully; desktop no horizontal overflow. Mobile document rendered and Next page changed Page1of5 to Page2of5. Screenshots observed; desktop evidence saved at ignored `sites277-shared-web.jpg`. This does not establish cold first-paint timing, live owner-auth summaries, real iPhone Safari behavior, or a fresh full authentication/signup regression pass. Temporary console/dashboard/QA tabs closed, viewport reset and clipboard cleared.

**Remaining verification failure: edge reuse.** Every repeated representative cover request reported `X-Portalink-Media-Cache: MISS`, not HIT. Delivery/headers are verified; edge caching is not complete. Cloudflare documents that `caches.default` is disabled in untrusted Workers for Platforms namespaces; actual Sites namespace trust is not independently verified, so this is a likely explanation, not an observed configuration fact. Next isolated source investigation should test a named cache via `caches.open('portalink-public-media-v1')` with bounded operation diagnostics, without weakening namespace isolation or changing config. No speculative cache change was applied or published after this failed check, respecting the stop/report boundary. Sources: [worker isolation](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/worker-isolation/), [cache namespaces](https://developers.cloudflare.com/workers/reference/how-the-cache-works/).

Final evidence: ignored `deployment-277.json`, `delivery-archive-check.json`, `delivery-live-postflight.json`, `delivery-fix-local-postflight.json` and tests/typecheck/lint/build logs. The live-check receipt's `passed:true` applies to route/image/auth assertions; cache reuse is explicitly not among those passed assertions. The post-publication documentation receipt is local/uncommitted. No further SQL, Storage, config or cover writes occurred during the worker correction.

## Latest cover-backfill retry — September 30, 2026

Latest continuation: corrected live dry-run rendered7 of10 projects;3 multipart PDFs were skipped. No covers uploaded or manifests written. A bounded multipart-reader correction is prepared locally with38 passing focused tests, awaiting continuation after the required stop. Existing migration/config activation is unchanged.

## September 30, 2026 approved creator-release activation

Fresh dashboard backup was confirmed by the user; full Storage metadata listing and the existing D1 rows were saved under ignored logs. Through the authenticated Supabase SQL editor, applied and individually verified, in order: `cover_thumbnail_schema.sql`, `project_covers_public_bucket.sql`, `share_cover_capability.sql`, `profile_handle_addresses.sql`, `profile_journey.sql`, `profile_employer.sql` from `supabase/pending/`. Filenames/comments retain their reviewed names; they now have an application record. Consolidated receipt checks23 source function bodies/security contracts and15 triggers, with valid constraints/policies and zero privacy/pin/contact integrity defects.

Skipped `first_project_context.sql` because Journey includes it; skipped the duplicate standalone `shared_profile_bundle.sql` because the exact final body was installed by Journey/employer; skipped `notifications_read_state.sql` because its timestamptz column already exists. The live database has no `supabase_migrations.schema_migrations` table; no ledger was created/repaired. Account-deletion and historical PDF-processing HOLD items remain unapplied.

Sites276 applied active `drizzle/0002_page_timings.sql` then `0003_project_read_signals.sql`, copied byte-for-byte from the approved `drizzle-pending/` references. Live table inspection confirmed all six new tables; original `media_comments`/`media_engagements` rows match the snapshot exactly. Runtime revision2 includes the specified RUM owner. The cover bucket is created but remains empty: the dry-run skipped10 unsupported draft-directory originals and no apply ran. See [handoff](agent-handoff.md) and ignored `logs/backend-activation-20260930/` for receipts and the prepared local path correction.

The counts and pending claims in older dated sections below are historical.

The original register was recorded on 2026-09-14 from repository source at commit `5512bd0` and the evidence linked below; that documentation-only pass did not connect to a database or change deployment state. Later dated application records below are separate evidence.

Updated 2026-09-29 with a prepared, unapplied PDF safety correction; the approved September 28 performance and September 27 grid-density applications remain recorded separately. There are **37 Supabase migration files**, one excluded account-deletion SQL candidate, and two separate Sites/D1 migration files. A file in Git establishes the intended change; it does not establish that a database received it. A successful isolated test establishes behavior in its synthetic database. A manual application record establishes that operation; only the specified catalog checks establish the observed schema, not a migration-ledger entry or all runtime behavior.

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

## PDF safety correction prepared September 29, 2026

| Migration | Purpose | Status |
| --- | --- | --- |
| [202609290001_pdf_processing_safety.sql](../supabase/migrations/202609290001_pdf_processing_safety.sql) | Service-only v2 worker RPCs, lease-token fencing, deterministic claims, idempotent completion and correct multi-job page totals | Prepared locally; not applied. Eight synthetic PGlite checks pass, including browser-role denials and stale lease behavior. |

This task did not query the hosted PDF schema or inspect its current function
ACLs. Existing PDF ingestion functions and tables must be checked before the
single forward migration is applied. Stop/drain all old PDF workers first;
legacy unfenced RPCs deliberately lose service-role execution. Start only the
matching upgraded worker after migration postflight. Preserve originals,
completed pages and queue records. No backfill or migration-history repair is
included. See [worker upgrade instructions](../workers/pdf_processor/README.md#coordinated-upgrade)
and the [release plan](trust-and-activation-release.md).

## Performance additions applied September 28, 2026

After explicit user approval, the owning task applied only these six new files to the existing Portalink Supabase project on 2026-09-28. **All six transactions succeeded.** Historical migrations were not replayed and the absent ledger was left unchanged. Website v266 is published from source `972392087eeabcf08bc249bd4620ba51376cd279`; the approved D1 index is included in its successful deployment, with independent index-catalog confirmation unavailable. Media-worker changes remain source only. See [implementation and release status](performance-audit-status.md) and [read-path details](performance-read-paths.md).

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
| [drizzle/0001_saved_media_read_index.sql](../drizzle/0001_saved_media_read_index.sql) | Existing Sites D1 database; adds the account/kind/time saved-page read index. | Explicitly approved September 28; included intact in successful Sites v266 deployment at 09:28 UTC. No per-migration receipt or index catalog is exposed by available Sites tools, so independent live index confirmation remains unavailable. Isolated SQLite tests pass. A read-only Sites overview confirms the existing engagement/comment tables, not application of this index. |

Earlier versions of [the Sites worker](../src/sites-worker.ts), including v265, used an `ensureSchema` routine to create these tables and indexes at runtime. The current performance source removes that routine and retains the existing tables/data. Consequently, table existence alone does not prove that `0000_media_interactions.sql` ran through a migration tool. Sites packages `drizzle/*.sql` for publication; verify D1 application through its deployment/migration evidence or live catalog before recording the approved index as applied. Do not send this SQLite/D1 SQL to Supabase.

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

2026-10-05: Prepared 202610050001_mutual_profile_connections.sql for owner/accepted-mutual list access. UNAPPLIED; requires explicit database deployment authorization and real permission validation before claiming live support.

2026-10-12: explicitly approved immediate session revocation SQL applied once to existing production Supabase project; inventoried202610120002_immediate_account_session_revocation.sql. Catalog31restrictive policies/hook and rollback-only live/session isolation checks pass;zero test residue. No unrelated migration/history repair. See immediate-session-revocation.md and release handoff.
