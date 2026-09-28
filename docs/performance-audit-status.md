# Performance instructions: implementation and release status

Source: the user's 15-page `Preformance edit instructions.pdf`, supplied September 28, 2026. All pages were read. This is an implementation record, not a claim that the audit's historical line numbers or measurements still describe production.

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

## Audit recommendations deliberately not completed in this pass

The PDF itself separates quick/data-flow work from later structural work. The following remain explicit follow-up work, not hidden claims of completion:

- A new query-cache library, per-project engagement subscriptions, completely targeted profile invalidation, and optimistic comment appends. Existing cache/auth generation and concurrent-write behavior need a coordinated lifecycle change; the current pass adds bounded service caches and batching without adding dependencies.
- Framer Motion API migration, broad CSS splitting/blur reduction, and font/asset removal. These require visual regression work across the recently changed screens. Current fonts already load nonblocking; the Lucide sprite is in use. Do not remove it as supposedly unused.
- Upload-time cover thumbnails and versioned PDF thumbnail outputs. These need stored metadata/consumer changes and a migration plan for existing files, rather than silently switching existing URLs.
- A persistent PDF process pool and parallel PDF page publishing. The present per-page process enforces killable deadlines and resource limits; naive pooling loses that guarantee, and parallel writes need attempt-fenced object paths/cleanup first. Encoder effort is improved now. No paid worker scaling was requested.
- Denormalized counters, removal of duplicated PDF metadata, statement-level attachment limits, destructive send-event retention, inbox cursor migration and indexed message/identity substring search. Public content search and messaging read predicates are improved now. The remaining schema changes need specific behavior/data-retention validation.
- Local edge JWT validation. Batching already reduces verification to one call per request. Replacing the current auth-server check needs confirmation of active signing keys, rotation and revocation expectations; this pass does not weaken that check.
- Earlier splash timing advice conflicts with the user's later exact 1.5-second signed-in MOBILE splash and repeating Hello World requirements. Those product instructions win. No splash/poster substitutions or restored obsolete static welcome screen.
- The PDF's potential private-video leak was not reproduced in isolated checks: the existing video schema's nested RLS/later private-content migration already restricts the lookup. The optional policy makes visibility explicit and indexed when that schema exists. The live job table is absent, so this policy change was skipped; no unverified production exposure is claimed.

## Verification and measurement

Detailed final check totals are recorded in `agent-handoff.md`. The comparison measures entry scripts plus HTML module preloads by raw compiled bytes, not compression, Lighthouse score or time-to-interactive. Final JavaScript is **963,489 bytes across 31 initial assets**, down from **1,234,271 bytes**: **270,782 bytes / 21.94% less**. Recursive static-import inspection matches that graph. Initial CSS is **291,907 bytes**, down from **306,244 bytes**: **14,337 bytes / 4.68% less**. Reorder/dnd and deferred feature chunks are outside the initial graph; production mock identity markers are absent. These final values supersede preliminary build measurements.

Browser checks use the real Home/feed components with isolated synthetic services, plus the actual local Settings/auth entry. At 390px/430px MOBILE and 1365px WEB, pagination/retry/return retained five columns and loaded content. No real account mutation was used. The existing ResponsiveImage `fetchPriority` warning remains. Temporary QA lives only under ignored `logs/` and must never be packaged.

No physical iPhone, live upload, end-to-end hosted Realtime, or Lighthouse result is claimed. Hosted SQL application and the catalog checks above are verified separately. The available browser tool does not expose Lighthouse/network tracing. Post-release network/request counts and real-device timings remain measurements to collect, not inferred from passing source tests.
