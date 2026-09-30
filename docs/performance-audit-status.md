# Performance instructions: implementation and release status

## September 30, 2026 — named edge-cache correction, publication authorized

The user requested fixing and publishing the remaining edge-cache issue. `src/server/publicMedia.ts` now opens the isolated `portalink-public-media-v1` named cache and never accesses `caches.default`, which Cloudflare disables for untrusted Workers for Platforms namespaces. Public-cover/avatar path validation, Accept-specific keys, immutable/legacy-avatar headers, MIME checks, identity stripping and background `waitUntil` writes are preserved. Cache-open/read failures safely bypass; all cache-operation failures emit fixed stage-only diagnostics without input or exception details. No Storage, SQL, runtime configuration, namespace trust or visibility changes.

15 focused media tests pass, including a disabled-default-cache fixture, eventual named-cache hits for covers and avatars, injected-cache bypass, open/match/put failures, Accept isolation, HEAD/ETag, invalid paths and authentication stripping. Typecheck, lint (0 errors / 90 existing warnings) and production client+worker build pass. Independent read-only review found no blocker. Source changes are limited to the public-media worker, its tests and release-status documentation; existing user source/docs are preserved. Publishing uses the existing Sites project and active D1 migrations only, no GitHub push.

Hosted HIT verification is pending the new deployment. Do not infer success from the Node Cache API fixture. This section supersedes the Sites277 cache limitation below only after a successful live verification receipt is added.

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

Latest backfill status: approved dry-run rendered7 covers in18,421ms, skipped3 multipart PDFs, and performed0 uploads/manifest writes. Prepared multipart support passes38 focused tests but awaits the next approved live retry. This is operator-side rendering time, not visitor first-paint performance.

## September 30 backend activation update

Sites276 is live; approved cover schema/public bucket/capability, shared bundle, D1 timings/reach and the RUM owner configuration are active. Existing originals and D1 interactions are preserved. **The cover backfill remains incomplete:** its live dry-run skipped all10 existing originals because they use the uploader's draft directory. No covers/manifests were written. The local validator correction passes22 focused tests and awaits a continued live retry. Therefore do not mark upload-time/backfilled cover delivery or the first-paint target complete. The visitor JS budget miss and physical-phone timing checks remain as recorded. Current receipts and limits: [handoff](agent-handoff.md).

Source: the user's 15-page `Preformance edit instructions.pdf`, supplied September 28, 2026. All pages were read. This is an implementation record, not a claim that the audit's historical line numbers or measurements still describe production.

## September 30 release-candidate review since Sites274

The [consolidated release review](release-review-sites-274.md) supersedes older
local byte/check totals and rollout ordering below. Final initial JavaScript:
main1,028,971 bytes /327,403 gzip; visitor684,656 /218,949. Visitor remains334,656
raw bytes over350KB despite reducing82,716 bytes from the verified Sites274
archive. Full Node1,330/1,330 pass with PGlite; typecheck/lint/client+worker build
pass. Cover/social-backfill source is prepared, but public Storage, pending
SQL/D1, runtime configuration, live backfill and release remain separately gated.
No hosted timing, real-phone performance or newly applied backend is claimed.

## September 30 source-only public media and timing collection

[Public media and RUM](public-media-and-rum.md) now records the source implementation of public cover/avatar edge caching and anonymous load timings, with a guarded owner table in Insights. The D1 migration `drizzle-pending/0002_page_timings.sql` is prepared, not applied; no publish or runtime owner configuration change occurred. Hosted post-release measurements still remain to collect. Public Storage transformations were confirmed by a read-only image request, but removing the extra stored cover sizes remains blocked by the existing three-object setter contract and needs a separate Supabase schema review.

## September 30 source-only visitor entry

The later [visitor-entry asset audit](visitor-entry-assets.md) supersedes the historical startup byte totals below for the current local branch. It records both main and /share entries separately. Live Sites273 is unchanged; no cover SQL, bucket or backfill has been applied. The 350KB raw visitor JS target remains unmet.

## Current boundary

The pass covers shared WEB/MOBILE services, startup loading, feeds, messaging, uploads, the existing Sites/D1 worker, and the existing media workers. Existing accounts, content, storage connections, access boundaries, routes, appearance, profile design, navigation, and 2–13 grid density are retained. Following explicit user approval on September 28, the owning task applied the six performance migrations to the existing Portalink Supabase project; all six transactions succeeded. Sites version 266 was published successfully at 2026-09-28 09:28 UTC from source `972392087eeabcf08bc249bd4620ba51376cd279`. The approved D1 index is included in that release; current Sites tools do not expose an index catalog or per-migration receipt for independent confirmation. PDF/video worker changes remain source only; no media-worker hosting or deployment was performed.

The owned checkout continues `codex/splash-reliability` from published source `ea28f084ef30fcbafa1118b95e11bf8ac566cc11`; it was not reset to the older GitHub main. The previous publication note and unrelated user folders are preserved. Reviewed integration into GitHub main remains separate from Sites publication.

## Implemented source

| PDF area | Result |
| --- | --- |
| Single-project reads | Read only the requested project, its readable creator/category and its attachments. Design and topic-signal reads select the required data. A partial creator record never contaminates the full-profile cache. |
| Home/Discover | Applied cursor feed RPC selects ordered, visible projects across the eligible corpus. Home pages 30 cards with retry and retained loaded extent; Discover ranks a bounded metadata candidate set and signs only selected covers. The owner density read/save no longer loads the entire portfolio. |
| Signed links | Account-scoped, bounded, in-memory URL cache reuses signatures until near expiry, deduplicates reads, and clears on identity changes. Multipart playback lifetime never exceeds the lifetime of its signed parts. Existing private buckets remain private. |
| Ordinary service identity | Local `getSession()` replaces repeated network `getUser()` identity reads in content, community, saves and messaging services. Server RLS remains authoritative. Sensitive auth/recovery and edge verification retain their existing checks. |
| Startup code | Production service registry excludes live mock/prototype services. Editors, auth/onboarding dialogs, portals and drag-reorder code load when needed. Lazy surfaces retain drafts after closing and provide local loading/failure recovery. Email typing no longer updates the shared auth context value. |
| Engagement and order | Array engagement RPC with visible-project checks; per-card reads coalesce. Three atomic arrangement RPCs validate and commit the complete change, preserving density and rollback on failure. Missing-RPC fallbacks retain compatibility during rollout; real errors do not fall back. |
| Page interactions / D1 | Only near-visible page bars request activity. Requests coalesce with bounded target and UTF-8 body size; each batch verifies the account once and uses two SQL reads. Runtime table creation is removed; existing data and tables remain. Approved saved-page index included in successful v266 deployment; independent live index confirmation unavailable. |
| Realtime | Viewer/conversation filters, private ID-only activity broadcast, debounced reconciliation, and polling only while disconnected or recovering from a failed refresh. Read receipts remain subscribed. Older servers retain compatibility behavior until the capability migration is installed. |
| Public search | Applied native GIN full-text RPC returns at most 20 public profiles and 30 public projects, preserving exact short words, longer prefixes, city filtering and private/hidden exclusions. It searches beyond the former browser-side sample limits. |
| Database access | Applied read/foreign-key/lease indexes, safely parsed UUID Storage paths, selective multipart validation and statement-scoped messaging identity/read rules. Video-specific changes are conditional and were skipped because the hosted video job table is absent. See `performance-read-paths.md`. |
| Uploads and workers | Bounded multipart upload concurrency with cancellation/draining, ordered manifests and captured per-file credentials. PDF WebP method 4. Compatible video remux before conversion, verified fallback, and bounded parallel output uploads with existing attempt fencing. |
| Caching | Immutable year-long headers for hashed assets; revalidating HTML; missing assets cannot receive cached HTML fallback. Matching alternate-host config. Unique immutable upload objects gain long-lived cache metadata. |
| Images | Lazy asynchronous message/comment images. Existing responsive media, viewport sizing and private-media behavior remain. |

## Approved database application — September 28, 2026

The owning task applied only these six reviewed additions to the existing Portalink Supabase project after explicit user approval and live prerequisite checks. Each transaction succeeded. Historical migrations were not replayed; the absent migration ledger was left unchanged.

1. `supabase/migrations/202609280001_performance_read_paths.sql`
2. `supabase/migrations/202609280002_project_feed_pages.sql`
3. `supabase/migrations/202609280003_atomic_arrangement_engagement.sql`
4. `supabase/migrations/202609280004_scoped_message_activity.sql`
5. `supabase/migrations/202609280005_public_content_search.sql`
6. `supabase/migrations/202609280006_messaging_read_identity.sql`
Separately, `drizzle/0001_saved_media_read_index.sql` was approved for the existing Sites D1 database and included intact in the successful v266 deployment. The documented hosting workflow applies migrations before Worker upload, but its returned success does not include a per-index receipt; current read-only tools cannot independently confirm the index catalog.

Live catalog checks confirmed 18 non-video indexes ready, four expected triggers correctly defined and enabled, and the definitions of 14 messaging policies plus three Storage policies. Realtime checks confirmed participant-only SELECT for activity, no client activity INSERT policy, the prior restricted typing policy, and `direct_conversation_states` publication with RLS enabled. All 15 checked function bodies match the reviewed source by MD5 after whitespace/comment normalization; security flags, search paths and explicitly specified ACLs also match. Existing participant/summary functions retain their prior anonymous EXECUTE grants (PUBLIC revoked, authenticated allowed); the identity and Realtime-version helpers are authenticated-only, and the broadcaster denies browser execution.

The hosted `public.video_processing_jobs` table is absent. Migration `202609280001` therefore skipped its three video indexes and video policy change through the reviewed compatibility guard; it did not install the video pipeline or backfill jobs. The 19 focused read-path/database checks pass in isolation. Catalog verification is separate from end-to-end hosted behavior. A read-only D1 overview confirmed existing `media_comments` and `media_engagements` tables, but not the new index.

The exact tested frontend/Sites worker source is published with the existing DB binding. Media-worker hosting/deployment and independent D1 index-catalog confirmation remain separate. Verify live cache headers, authenticated feed/messaging and upload behavior after release. Do not provision another backend or a paid second instance implicitly.

## Cover delivery follow-up — September 30, 2026 — source only

The requested follow-up now prepares browser publish/edit-time WebP covers at
200/400/800 long-edge pixels, content-hashed manifests, thumbnail-only project
grids, batched private signing and the public shared-profile bundle reader.
The explicit backfill uses the same geometry/encoding contract. PDF/video worker
deployment is not required for these covers; full-document page processing and
its worker outputs remain separate.

Nothing in this follow-up is deployed or applied. The nullable manifest schema,
public `project-covers` bucket with visibility/cleanup guards, and invoker bundle
RPC are three separate pending SQL files. Existing deployments retain the legacy
cover/read path until their prerequisites are approved. See
[rollout and privacy contract](cover-thumbnail-rollout.md),
[backfill operation and limits](backfill-cover-thumbnails.md), and the current
[handoff](agent-handoff.md) for source checks and the explicit approval boundary.

## Audit recommendations deliberately not completed in the original pass

The PDF itself separates quick/data-flow work from later structural work. The following remain explicit follow-up work, not hidden claims of completion:

- A new query-cache library, per-project engagement subscriptions, completely targeted profile invalidation, and optimistic comment appends. Existing cache/auth generation and concurrent-write behavior need a coordinated lifecycle change; the current pass adds bounded service caches and batching without adding dependencies.
- Framer Motion API migration, broad CSS splitting/blur reduction, and font/asset removal. These require visual regression work across the recently changed screens. Current fonts already load nonblocking; the Lucide sprite is in use. Do not remove it as supposedly unused.
- Upload-time covers and versioned selected-page cover outputs now have prepared source and pending rollout files in the September 30 follow-up above. Live schema, bucket, backfill and application deployment remain unapplied. Full-document PDF worker outputs are unchanged.
- A persistent PDF process pool and parallel PDF page publishing. The present per-page process enforces killable deadlines and resource limits; naive pooling loses that guarantee, and parallel writes need attempt-fenced object paths/cleanup first. Encoder effort is improved now. No paid worker scaling was requested.
- Denormalized counters, removal of duplicated PDF metadata, statement-level attachment limits, destructive send-event retention, inbox cursor migration and indexed message/identity substring search. Public content search and messaging read predicates are improved now. The remaining schema changes need specific behavior/data-retention validation.
- Local edge JWT validation. Batching already reduces verification to one call per request. Replacing the current auth-server check needs confirmation of active signing keys, rotation and revocation expectations; this pass does not weaken that check.
- Earlier splash timing advice conflicts with the user's later exact 1.5-second signed-in MOBILE splash and repeating Hello World requirements. Those product instructions win. No splash/poster substitutions or restored obsolete static welcome screen.
- The PDF's potential private-video leak was not reproduced in isolated checks: the existing video schema's nested RLS/later private-content migration already restricts the lookup. The optional policy makes visibility explicit and indexed when that schema exists. The live job table is absent, so this policy change was skipped; no unverified production exposure is claimed.

## Verification and measurement

Detailed final check totals are recorded in `agent-handoff.md`. The comparison measures entry scripts plus HTML module preloads by raw compiled bytes, not compression, Lighthouse score or time-to-interactive. Final JavaScript is **963,489 bytes across 31 initial assets**, down from **1,234,271 bytes**: **270,782 bytes / 21.94% less**. Recursive static-import inspection matches that graph. Initial CSS is **291,907 bytes**, down from **306,244 bytes**: **14,337 bytes / 4.68% less**. Reorder/dnd and deferred feature chunks are outside the initial graph; production mock identity markers are absent. These final values supersede preliminary build measurements.

Browser checks use the real Home/feed components with isolated synthetic services, plus the actual local Settings/auth entry. At 390px/430px MOBILE and 1365px WEB, pagination/retry/return retained five columns and loaded content. No real account mutation was used. The existing ResponsiveImage `fetchPriority` warning remains. Temporary QA lives only under ignored `logs/` and must never be packaged.

No physical iPhone, live upload, end-to-end hosted Realtime, or Lighthouse result is claimed. Hosted SQL application and the catalog checks above are verified separately. The available browser tool does not expose Lighthouse/network tracing. Post-release network/request counts and real-device timings remain measurements to collect, not inferred from passing source tests.
