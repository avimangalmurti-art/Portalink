# Release review: creator portfolio candidate since Sites 274

## September 30, 2026 — named edge-cache correction, publication authorized

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

Latest approved continuation:7 generated covers,3 multipart-source skips,0 applied/errors in18,421ms. No live writes. A Node-only bounded multipart correction is prepared with38 passing focused tests; user continuation is required after the stop report before another dry-run/apply. See current handoff.

## September 30 execution status — Sites276 and backend active; cover retry pending

The user confirmed a fresh dashboard backup, approved SQL Editor activation and later publication. Six approved Supabase/Storage scripts succeeded and their catalog/function/privacy checks passed; duplicate context/bundle scripts and the existing notification column were skipped. Sites276 (`ed263ea0055155a9231aab2ce8dfd35d0196fe07`) applied D1 0002/0003, preserving existing interactions. Runtime revision2 activates the specified RUM owner. The ordered inventory below remains the reviewed reference; HOLD items remain excluded.

The live cover dry-run considered10 and skipped10 because its original-path validator did not recognize the uploader's draft directory. **No covers were uploaded or manifests written.** A local source correction has22 passing focused tests and awaits an explicitly continued live retry under the user's stop-on-failure instruction. See [current handoff](agent-handoff.md) for receipts, timestamps, exact counts and limits. Earlier statements below describe the original review or blocked attempt, not current deployment/schema state.

## Historical September 30 backup-blocked attempt — superseded

The user subsequently approved the ordered non-HOLD backend rollout, conditioned on a fresh database backup and full Storage listing, with no publication. The Storage listing is complete: 57 objects across 3 buckets, exported as 60 metadata records in ignored `logs/release-backend-20260930/storage-inventory.csv` (73,120 bytes; SHA-256 `b451a685e0eecde13be19ed087267fef334bb91de5cb9a7cf513e62d508960e0`). A fresh complete local database backup could not be obtained with available access. The dashboard's scheduled physical backup at 2026-09-30 10:47:52 UTC is not a downloaded pre-rollout dump. Therefore **zero migrations, Storage changes, runtime changes or backfill writes were applied**; all backfill counts are zero because it was not run. Sites remains at version 274. RUM_OWNER_PROFILE_ID remains pending with the user-approved value `49e4e861-795a-47f2-b4a6-b071351c4d4b`.

The table below remains the candidate inventory, but its execution also requires these compatibility corrections: Sites' available D1 tools are read-only and its configured migration path requires publication; 274's cover cleanup rejects the new `social.webp` asset; and the employer migration's reverse profiles/projects foreign key makes 274's unqualified `profiles!inner` preview embed ambiguous. These must be coordinated with a future publication or reviewed compatible adjustments. No publication is authorized in this follow-up. The full backfill runner currently continues after project failures and needs a tested fail-fast mode before use under this approval. See the current handoff for access requirements and exact applied-zero receipt. Earlier review/test results below describe the reviewed source, not an executed rollout.

Reviewed September 30, 2026. **Source checks pass; release remains gated. No connected SQL, Storage/config changes, publish, push or source commit was performed.**

Scope is the complete working candidate on `codex/creator-share-previews`, including uncommitted/new files, not just the last commit. Owned checkout: `logs/mobile-studio-20260929`; HEAD `ddfded3064dbec02e837f338f4cb249564f76f70`. Recorded Sites 274 source: `a877ab0`. Earlier Moment 1/2/3/4/6, mobile context, performance and sharing changes are retained. Root application source is untouched.

## Verdict and repaired regressions

The candidate is ready for review of its source and pending backend plan. It is **not a claim of production readiness**: the visitor entry still misses its 350 KB raw-JS target; pending backend changes have not been activated; real email delivery and physical Safari checks remain outstanding. No new unresolved functional regression was found in the exercised local flows. This is not an exhaustive equivalence proof against the live release.

This review repaired:

- **Private Journey pair disclosure in the pending schema.** Ordinary profile RLS allows public whole-row reads. Keeping a private Then/Now choice only in `profiles.then_now` would expose its IDs even while Journey was off. The pending migration now stores the choice in owner-readable `profile_journey_pairs` and mirrors it into the public profile only when opted in. Owner hydration reads the private record; narrow missing-table fallback preserves compatibility. Synthetic PostgreSQL tests cover anonymous/member/owner access, toggling and cleanup.
- **Live-card Copy opened the share dialog instead of copying.** Copy now follows the clipboard path and dismisses only after success; Send opens the full share surface. Confirmed with actual component tests and the fixture publication flow.
- **Shared mobile context lost page actions and navigation.** The visible page now joins the shared action context, retaining auth-gated Save/Comment alongside Sign in/Create account/Share/Copy/Portals/Settings. Portals and Settings have real handlers and a return path.
- **Pinned cover parity.** Worker metadata now tries public pinned work before explicit wall order and newest work.
- **Hidden hydrated project.** Shared hydration refuses a newly unavailable project rather than accepting an earlier public bundle's stale visibility.
- **Backfill omitted landscape social covers.** Capability-gated backfill now generates the same 1200×630 asset as publication and upgrades older three-variant manifests. Explicit owner foreign-key selection avoids ambiguity after Start here adds a reverse project FK.
- **Rendered-document React warning.** The image priority uses the lowercase DOM attribute supported by React 18.
- **Stale Studio Drafts wording.** It now explains the existing local upload-resume path without promising a draft list.

Changed source in this review: `PortfolioLiveCard.tsx`, `studioModel.ts`, `SharedContextActions.tsx`, `contextActions.ts`, `MobilePageContext.ts`, `MediaInteractionBar.tsx`, `ProjectMediaViewer.tsx`, `DocumentAttachment.tsx`, `useSharedProfileQuery.ts`, `sharedPreview.ts`, `contentReaders.ts`, `scripts/backfill-cover-thumbnails.mjs`, and pending `profile_journey.sql`. Test fixtures were brought up to the actual new shared dependencies and changed product behavior; assertions were not removed to hide failures. Added focused private-pair, live-card, shared-action, pinned-cover and social-backfill coverage. Earlier handoff sections retain the full feature-by-feature file inventory.

## Automated verification

- Full command: `node.exe --test @(rg --files tests -g '*.test.mjs')`.
- Both `PGLITE_MODULE` and `PGLITE_MODULE_PATH` pointed to the already installed PGlite runtime. **1,330 tests passed; 0 failed, 0 skipped**, final run 336.3 seconds. PostgreSQL/SQLite schema execution was limited to disposable in-memory test databases.
- `npm.cmd run typecheck`: pass.
- `npm.cmd run lint`: pass, **0 errors / 90 existing warnings**.
- `npm.cmd run build`: pass, production client and Sites worker. Worker **82.28 KB raw / 22.01 KB gzip**. Existing large-chunk notices remain.
- `git diff --check`: pass. Git reports local ignore-file access/line-ending warnings; no whitespace errors.
- `node.exe scripts/backfill-cover-thumbnails.mjs --dry-run --fixture`: 8 fixture projects considered, 3 eligible/generated, 5 skipped, **0 applied / 0 failed**, 29,004 encoded bytes, 714 ms. No live backfill or live project enumeration. Social upgrade/idempotence is separately covered by the offline pipeline test.

Evidence: ignored `logs/release-review-qa/`, especially `node-full-verified.log`, `typecheck-verified.log`, `lint-verified.log`, `build-verified.log`, `backfill-fixture.log`, `entry-assets-final.json`, `browser-matrix.json` and screen PNG/text captures. Initial failing runs are retained as diagnostics; only the final green run is the completion result.

## Local browser coverage

Actual App/Visitor components, Auth provider, router, presentation, PDF renderer and CSS ran at localhost5178 with explicitly isolated synthetic services, QA-scoped storage and local media. All writes were fixture-only. No credentials or real account data were used. The fixture card endpoint returns synthetic metadata, so **worker/card data parity is established by the Node tests, not by treating that illustrative fixture record as a real API response**.

At **390×844, 430×844 and 1280×900**, each in **Light and Dark**:

- Home, own Portfolio and Journey, another creator's profile, document and image viewers, Studio, Messages list and conversation, actual Explore/world view, Settings, Reads, UUID shared profile, handle shared profile and the share sheet were opened and captured.
- Body canvas followed white/black appearance. No document-wide horizontal overflow in recorded captures. Mobile document viewing omitted the main capsule; member screens retained it. WEB retained its sidebar/density controls and existing viewer presentation.
- Journey persisted the selected view through navigation, rendered Then/Now and multiple years with owner-only gap invitations. Other-profile empty state remained available; shared profile omitted owner counters and collaboration/message icons.
- Both signed-out share routes showed work and the nonblocking bar without a welcome wall. Mobile shared project opened directly in reading mode without the coach mark.
- The first-session landing and local PDF cover were checked at both phone widths in both appearances. Desktop zero-project Home retained its existing flow. Desktop Studio still shows **“Studio is still being designed”**; it is not a completed web Studio.
- Explore was also opened through its actual navigation button; an early fixture selector targeting `/search` did not prove desktop Explore and those captures were superseded by the `*-explore-actual` captures.

Interaction checks:

- Mobile page 1→2, progress/current-page label, document and image context sheets; a real local PDF also rendered to canvas. Shared page Save→actual sign-in form→same project, retaining page 2 through `?page=2&media=…`. Desktop handle Sign in returned to exactly `/mira`.
- Shared Portals→Settings→Back returned to the portfolio's Portals view.
- Reads chart→page 2 detail displayed its thumbnail, reached/saved/comment totals and deliberate-member information. The fixture summary used 18 opens, 6 finishes and 4 page saves.
- Fresh synthetic registration→Welcome completion→first-project upload; fixture PDF→local cover, title “Quiet Rooms” and May 2024 metadata; optional prompts→review; close/reopen resumed Details; publish→own profile with one tile and live card; handle introduction→Copy dismissed the card. A 430px Dark local-file-to-cover sample reported **758 ms**. This is one local fixture sample, not phone/upload/network performance.
- Skip produced the single dashed first-project tile; re-entry reopened the flow. Both phone appearances were inspected. No real registration or publication occurred.
- Share handle introduction, Copy confirmation, preview/QR rendering and Send fallback composer were exercised. Audience template selection worked. No email was sent. Native OS share, physical QR scan and actual saved PDF/QR opening remain manual checks.
- The document priority warning found early in this pass was fixed. Fresh rebuilt fixture checks had no captured warning/error entries. HMR at canonical fixture URLs can leave the isolated harness; final checks used fresh fixture loads. This is not a hosted-console claim.

The Sites 274 baseline is the recorded source/archive and prior verification notes; this pass did not run an exhaustive live-versus-local visual diff or exercise real accounts. Intentional differences are the requested new moments, mobile context sheet, headers, reading mode and analytics—not regression failures. No physical iPhone or real Safari toolbar/safe-area behavior is claimed.

## Build comparison with Sites 274

The baseline archive `logs/portalink-release-20260930.tar.gz` was inspected in memory. Its SHA256 matches the publication record:
`fc9e641bb52bc29a4e83944029e1b2d49ba0fb271bbd7b7081b46f161730827d`.
Both measurements use the same static HTML/import-graph traversal and per-file Node gzip calculation.

- **Main:** Sites 274 JS 997,991 raw / 316,096 gzip; candidate **1,028,971 / 327,403**. CSS 322,151 / 51,269 → **328,800 / 52,878**. JS chunks 33→38.
- **Visitor:** Sites 274 JS 767,372 raw / 244,764 gzip; candidate **684,656 / 218,949**. CSS 325,931 / 52,262 → **336,355 / 54,312**. JS chunks 16→18.
- Main gained 30,980 raw JS bytes. Visitor shed 82,716 raw JS bytes (~10.8%) but still exceeds **350,000 raw bytes by 334,656**.
- The largest mixed shared chunk is about 446.7 KB raw; React DOM is 132,685 bytes. The shared graph retains canonical auth/Supabase, router, presentation and UI infrastructure. PDF.js/worker, video playback, auth dialog/onboarding, publishing/editor and Messages feature chunks are absent from the static visitor graph.
- These are build artifacts, not hosted transfer/phone timings. Dynamic chunks, fonts, images, HTML, worker and data are excluded. Shared chunks should not be added twice when comparing a session that visits both entries.

The exact final chunk inventory follows at the end of this report.

## Pending backend approval and application order

**One inventory, not an instruction to apply everything.** Before any approval is executed, read the hosted catalog/ledger and verify prerequisites. Historical migration history is not a reliable invitation to replay every migration. Do not replace the existing Supabase project, D1 binding, accounts or Storage. No down migrations are prepared; additive preservation is the default rollback strategy.

“READ” flags privacy/visibility behavior to review before approval. Steps with “skip” or “hold” are deliberately not normal rollout actions.

| Order / decision | File or configuration | Purpose | Dependencies / application gate | Rollback note |
| --- | --- | --- | --- | --- |
| 0 — read-only preflight | Existing Supabase catalog/ledger; D1 applied history; bucket/config inspection | Confirm actual state, constraints, RLS, existing handles/notifications, DB binding and current object count. | Separately authorized connected inspection; do not repair history or replay old migrations automatically. | Read-only; no rollback. |
| 1 — approve Supabase | `supabase/pending/cover_thumbnail_schema.sql` | Nullable manifest, exact variants, revision-checked setter, invalidation, private fallback reads and visibility/deletion fences. **READ:** private originals remain private; fallback cover access follows readable-project rules. | Existing content schema, ownership/RLS and September 28 `storage_path_uuid` helper. Use the updated candidate, not an older copy. | Revert app usage first; retain additive columns/data. Do not remove cleanup fences while public objects exist. |
| 2 — separate public Storage approval | `supabase/pending/project_covers_public_bucket.sql` | PUBLIC WebP bucket, 5 MiB limit, public-visible listing, owner writes/deletes and service-role upload visibility guard. **READ public-cover exposure below.** | Step 1; reject conflicting existing bucket settings. Validate upload/privacy serialization and cleanup before enabling writes. | Remove objects through Storage API before policy/fence removal. Already downloaded/cached public images cannot be recalled. |
| 3 — approve capability | `supabase/pending/share_cover_capability.sql` | Signals support for optional 1200×630 `social.webp` to publishers/backfill. | Updated steps 1–2 with social manifest/path validation, then capability; otherwise writes safely stay at three sizes. | Revoke/drop capability to stop new social writes; retain valid existing files/manifests. |
| 4 — approve handles | `supabase/pending/profile_handle_addresses.sql` | Confirmed lowercase handle, unique index, reserved validation, availability/change/shared RPCs, 90-day aliases and rate limits. | Existing `profiles.handle` is retained where present; preflight case-insensitive collisions. Historical underscore/hyphen handles remain unconfirmed and use UUID fallback. | Keep issued URLs/aliases. Disable new changes before retiring endpoints; do not destructively drop address history. |
| 5a — skip duplicate when applying 5b | `supabase/pending/first_project_context.sql` | `made_in`, `field`, `story_answers`; one-time legacy JSON adoption. Learned is in `story_answers.learned`, not a redundant column. | Included by Journey below. Standalone only if deliberately releasing Moment 1 separately. | Preserve authored fields/JSON; old client fallback remains. |
| 5b — approve Journey | `supabase/pending/profile_journey.sql` | Includes 5a; `show_journey=false`, private `profile_journey_pairs`, public `then_now` mirror, captions, validators/cleanup and bundle update. **READ public Journey below.** | Existing owner/category/project RLS. This review's private-pair repair is part of the candidate. Existing public selections are adopted before normalization. | Turn off public Journey, preserve private choices/columns. Do not reinstall the earlier pair-leaking definition. No milestones table is included. |
| 6 — approve employer fields | `supabase/pending/profile_employer.sql` | `portfolio_headline` (existing `headline` remains Bio), school, availability, Start here, explicit public email and download preference; bundle updated atomically. **READ contact/download visibility below.** | Profile/project schema; explicit `projects_profile_id_fkey` owner joins in candidate. Complete current bundle definition required with download opt-out. | Preserve authored data. Clear contact or disable exposure before reverting UI; never restore an old bundle that omits persisted privacy/download choices. |
| 7 — verify definition; normally skip duplicate | `supabase/pending/shared_profile_bundle.sql` | One anonymous SECURITY INVOKER public profile read with visible categories/projects and cover metadata. | Same final RPC body is embedded in Journey and employer SQL; applying step 6 already installs it. Keep copies identical; no duplicate rollout needed. | Restore only a compatible visibility-aware definition. Missing-RPC client fallback exists; permissions/network failures do not trigger it. |
| 8 — optional only if absent | `supabase/pending/notifications_read_state.sql` | Idempotent `notifications.read_at` repair. | Already declared by creator-beta SQL; inspect actual column first. Missing-column client treats legacy records as read. | Leave additive nullable column/data; earlier clients ignore it. |
| 9 — approve D1 | `drizzle-pending/0002_page_timings.sql` | `page_timings` and timestamp index for sampled client load timing. **READ:** no account/profile/IP/UA fields; 30-day sampled cleanup. | Existing Sites DB binding. Retained outside active `drizzle/` to prevent unapproved auto-application on publish. | Disable timing writes/read UI first; retain or explicitly approve deleting aggregate telemetry. |
| 10 — approve D1 | `drizzle-pending/0003_project_read_signals.sql` | Reach events/daily rollups, atomic triggers, deliberate-action records/revocation, acknowledgements and weekly notes. **READ reach privacy below.** | Existing D1 page-interaction schema `0000/0001`; independent of RUM but apply in recorded order. Migration is not blindly rerunnable; use applied-history/transaction controls. | Stop endpoints/notifications first. Preserve original interactions and derived data unless deletion is separately approved; never replace D1 with Supabase. |
| 11 — approve runtime value | `RUM_OWNER_PROFILE_ID` in Sites worker runtime config; implementation `src/sites-worker.ts` / `src/server/rum.ts` | Owner-only timing summary and Insights table. No value was changed or guessed. | Confirm the real owner **profile** UUID; Supabase session and ownership verification still required. Missing/invalid value fails closed. | Remove value to disable summary; does not delete timing rows. |
| 12 — approve release separately, then live inspection/backfill separately | `scripts/backfill-cover-thumbnails.mjs`; documented in `docs/cover-thumbnail-rollout.md` | Idempotent current-source render, content hashes, public variants/social asset and revision-checked manifests; also upgrades old three-variant manifests. | Steps 1–3 and cleanup-capable app active; explicit live dry-run/count approval, then separate `--apply` approval. Server-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Node renderer, ffmpeg only for posterless video. | Originals unchanged. Retain old deterministic files for concurrent/retry safety; cleanup through guarded APIs. Restore manifest only against a fresh valid source/revision, not a blind overwrite. |
| Preserve — no new values | Existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, runtime mode, `ASSETS`/`DB` bindings; public `avatars` bucket | Existing app/service connection; build derives `__APP_VERSION__`. Public media uses runtime `caches.default`; no new cache binding. | Reuse current backend. No service-role key in browser/worker build variables. Existing public avatars need no new bucket/policy. | Retain existing values/bindings. Versioned avatars immutable; legacy mutable paths revalidate after 5 minutes. |
| Separate unresolved delivery gate | Supabase Auth custom SMTP/provider configuration (no prepared credential file) | Ordinary signup/recovery delivery. Earlier inspection recorded custom SMTP OFF; deleting users did not fix delivery restrictions. | Reverify current provider state; user chooses/approves credentials, sender/domain and config. Not changed here. | Provider-specific rollback; keep accounts and Auth project. Do not infer that all resets are delivered to the owner. |
| HOLD — excluded | `supabase/pending/account_deletion_safety.sql` | Future delayed/deferred deletion schema, not approved for this release. | Requires conversation preservation, public-cover cleanup/fences, D1 treatment and user review. Account deletion remains hard-disabled. | Do not apply/enable. Earlier one-time administrator reset is not ongoing authority. |
| HOLD — excluded handlers | `supabase/pending/deletion-request.mjs`, `supabase/pending/deletion-worker.mjs` | Proposed deletion handlers, not migrations. | Same deletion gate; deployment/config/allowlist review outstanding. | Keep undeployed/disabled. No actual accounts/files removed. |
| HOLD — historical item outside pending folder | `supabase/migrations/202609290001_pdf_processing_safety.sql` | Previously prepared PDF-processing queue/claim safety forward fix. | Read current status; requires coordinated PDF worker drain/upgrade. Not a routine dependency to bulk-apply for this UI release. | Old worker rollback can violate claim fencing; coordinate worker/schema compatibility first. |
| Documentation only | `drizzle-pending/README.md` | Explains why unapproved D1 SQL remains outside active `drizzle/`. | Update applied history only after explicit approval; Sites publication automatically runs active drizzle migrations. | No execution. |

### Privacy and visibility approval notes

**Public covers:** anonymous visitors may enumerate names/paths and ordinary object metadata for currently PUBLIC, visible projects, including retained older hashes. Paths disclose profile/project UUIDs and content hashes. Originals remain private. Upload guards also constrain service-role backfills. Hiding/deleting/moving work requires deleting every affected public prefix through Storage and clearing its manifest before SQL permits the transition. **A public URL or year-long cached copy cannot be revoked after download/cache**, even after a project becomes private. Approving the public bucket must explicitly accept this limitation.

**Journey:** default OFF; the visitor UI shows no Journey toggle or Then/Now card until opted in. Private pair IDs now stay in the owner-only table, including while the public mirror is NULL. **Dates, learned text and per-project then_now_caption are still public-project metadata under existing row-level access; the bundle also returns captions while Journey is off. The toggle is not a privacy switch for those individual project fields.** If those fields must be private too, that requires a separately reviewed storage/access change before approval. Pair validation requires two distinct same-owner visible projects, and visibility/deletion cleanup removes invalid pairs. No fabricated entries; gap invitations are owner-only.

**Contact and download:** public email is OFF by default and explicitly typed by the creator. The authentication email is never inferred or read for contact. Whole-row public profile RLS means opt-out must clear the stored address; the pending trigger/check enforces that. Download is ON by requested default and respects the stored opt-out in the same updated bundle. A visitor can already read the public originals; disabling the export button is not DRM.

**Reach and timing:** visitors are counted as tab/day opens, never identified. The exact reach request is `project_id, session_token, furthest_page, page_count, ref_class, vw_bucket`; no account ID, raw referrer, IP, user-agent string or cookies. The token is memory-only and stored only as a project/day SHA-256 hash. Credential-free, no-referrer keepalive fetch replaces sendBeacon because sendBeacon includes credentials. Raw reach is retained 30 days, daily rollups 13 months, with 1% opportunistic cleanup and no cron. Ordinary private saves remain unnamed; **Save and let the creator know** is a separate deliberate choice. Private retry/unsave/delete revokes disclosure. Named action records have their own revocation lifecycle, not the anonymous-event retention period. Summary authorization is current-project-owner only. Anonymous clients can forge counts; these are product signals, not fraud-resistant unique-person analytics.

Handle availability separately rate-limits with daily-salted hashed account/forwarded-IP-derived keys (one-day retention). This is distinct from reach, which stores no IP-derived visitor identity. “Shared” is recorded conservatively when preparing copy/send/QR; cancelling after preparation can still lock in the old-address alias rule.

### Backfill scope and estimate

The script defaults to dry-run, rejects fixture `--apply`, and does nothing to live data without explicit approval. For each eligible public project it rechecks source/visibility/revision, renders the selected image/PDF page/video poster (or ffmpeg frame), generates 200/400/800 WebP plus 1200×630 when supported, hashes the bytes, uploads missing immutable objects and invokes the revision-checked setter. Existing complete manifests skip; partial objects are reused; private/hidden/unsupported/multipart-without-rendered-source records skip with a reason. Failure logs do not expose signed source URLs or credentials. A failed public attempt may deliberately retain deterministic objects for a concurrent successful writer or resumable retry.

The last historical count was **10 projects**, not a fresh live count. If all ten are eligible, expect up to **40 WebPs and 10 manifest updates** with social capability. Allow roughly **2–10 minutes** for ten small/medium documents on a normal connection; large PDFs/video, rate limits and ffmpeg can take longer. This is an estimate, not a measured live duration. Obtain the actual eligible count in an approved live dry-run before authorizing `--apply`.

## Unfinished features and handlers

- **Journey:** non-project milestones/inline milestone CRUD were deliberately omitted, as the task allowed.
- **Context actions:** Home/Explore global Search; Explore Your world/My city/Reset; profile/project/shared Report; conversation Share portfolio lack actual handlers. They are filtered out rather than rendered as inert actions. No surrounding navigation redesign was added during review.
- **Studio:** web Studio remains unfinished; mobile Drafts cannot list/resume stored drafts from Studio; Activity Mark unread is absent. Existing uploader/dashed-tile resume and Mark read remain. The earlier user-approved gap is documented rather than disguised.
- **First session:** draft/live-card state is local to this device/browser; no cross-device draft or interrupted-upload byte resume. Closing the browser before a publish-RPC acknowledgement retains the existing server-idempotency limitation.
- **Sharing:** handle/schema-dependent writes need activation; absent columns use the permanent UUID URL. Physical Safari Copy can lose transient activation while awaiting appearance/handle writes; test it on-device. Native Share has a prepared second-click path, but OS behavior is unverified. No email integration or address storage.
- **Portfolio PDF:** supports PDF/images, flattened/raster output, ≤150 dpi, 120-page/80 MB caps. Does not retain searchable text, form fields, original annotations or interactive media. Previous fixture generation reached “Your PDF is ready”; browser download capture/blob navigation prevented opening the saved artifact. Actual export/save/open remains a release check.
- **Reads:** no unique-person claim; reload resets the tab token; up to the last 10 seconds can be lost on tab close. Unknown multi-PDF offsets wait for counts. Raster/scanned pages without a text layer use page numbers. Weekly notification occurs only on a Sunday-after-18:00 local visit/focus; rollup weeks approximate seven UTC dates. No background scheduler or weekly email.
- **Performance:** visitor initial JS target still missed; no new hosted first-paint/cache/waterfall benchmark. The capability may transform 200/400 delivery from 800 where available, but all three stored variants remain required by the manifest schema. Posterless ffmpeg backfill and >256 MiB/unsupported sources need explicit handling/review.
- **Backend:** pending migrations/capability/bucket/config are not deployed features yet. Real SMTP signup/recovery remains an external delivery gate. Do not treat fixture success as live persistence/permission proof.

## Physical-device and post-approval checks

Before an iPhone release sign-off, test **iPhone Air (420×912 CSS baseline) on actual iOS 26 Safari**, plus installed PWA:

1. Canvas/status bar/floating Safari toolbar, expanded/collapsed chrome, scroll-under behavior, last-row reachability, Home→Studio→Messages capsule stability, orientation and real safe areas.
2. Keyboard/focus/autofill, forms and close/back paths; actual long-press/context-sheet gestures; tap chrome, horizontal page swipe, pinch/zoom/index and the correct page save/comment target; reduced motion.
3. Real Files picker, instant preview latency, large PDFs/video memory, permission denial, backgrounding/draft retention/storage quota.
4. Copy with pending appearance/handle writes; native Share success/cancel; Mail composer without Portalink sending; QR download and scan; save/open a two-project exported PDF and inspect every page/QR/link.
5. After separately approved backend activation: real owner/non-owner/anonymous RLS, public-cover cleanup and concurrent privacy transitions, private Journey access, contact opt-out, handle redirects/alias expiry/crawler tags, D1 dedupe/attribution revocation/notifications, weekly timezones, RUM owner guard and actual edge-cache/phone waterfall.

## Approval handoff

No further action is scheduled. Please review and explicitly approve the desired **Supabase**, **public Storage**, **D1**, **runtime/SMTP configuration**, and **live backfill** steps separately. A later **publication/push approval is also separate**; this review does not authorize one. Account deletion and the historical PDF worker migration remain on HOLD.

The existing Vite preview was retained. Temporary QA tabs were closed and viewport overrides reset. Source ownership is yielded with all candidate work preserved.


## Exact final initial-graph inventory

### index.html

```text
assets/AnimatePresence-CquA-aJC.js
assets/AuthContext-CD2Q2qNV.js
assets/Button-EiVy12cU.js
assets/CollaborationPage-DjPgEl4a.js
assets/InteractionSafePresence-BQTHt0iW.js
assets/MobileProfileContext-mqz0aR-1.js
assets/PortalinkSplashLoader-BEx7B2Sn.js
assets/RumPageView-BII3fHaj.js
assets/ServicesContext-d4rKKrPt.js
assets/StateViews-D431t3IE.js
assets/arrow-left-Dc6oCdQj.js
assets/backNavigationTransition-D3yJrV0D.js
assets/chunk-62JRHF6Z-urv4XjyC.js
assets/circle-alert-CKbIkRdB.js
assets/communityServices-6t5MFN2Z.js
assets/contentServices-BisZKIB7.js
assets/createLucideIcon-CYjSDPOe.js
assets/creatorSaveService-bjdqZ-GM.js
assets/eye-off-75aEwBH8.js
assets/jsx-runtime-CF4O39kz.js
assets/main-CAc-3716.js
assets/mediaProcessingReads-B1lhmLtr.js
assets/mediaService-Cr3k0Ufb.js
assets/preload-helper-Czpn1I53.js
assets/projectReaders-CwvIRuSU.js
assets/proxy-D9pUhISG.js
assets/publishing-C9Z7rEKR.js
assets/react-dom-C0SgZ5rF.js
assets/rolldown-runtime-B0Z9INg1.js
assets/rotate-cw-BbRLcZ9l.js
assets/rum-lJiDKchg.js
assets/shareModel-CBPSscBZ.js
assets/triangle-alert-DltAIXFp.js
assets/typefaces-B45jFx_6.js
assets/use-reduced-motion-C5e5pEAp.js
assets/useAsyncAction-DKjwA01Q.js
assets/usePresentation-DHPmVFlu.js
assets/useProjectGridDensity-B5YVyt-e.js
```

CSS:

```text
assets/RumPageView-C6gdGYKO.css
assets/main-Dm6Sn3dO.css
```

### share.html

```text
assets/AuthContext-CD2Q2qNV.js
assets/ProfileAvatar-CpXE-S_e.js
assets/RumPageView-BII3fHaj.js
assets/ServicesContext-d4rKKrPt.js
assets/chunk-62JRHF6Z-urv4XjyC.js
assets/createLucideIcon-CYjSDPOe.js
assets/info-D7eGWBFa.js
assets/jsx-runtime-CF4O39kz.js
assets/preload-helper-Czpn1I53.js
assets/profile-header-CrTNFGB_.js
assets/profileLinks-FicAxuJz.js
assets/react-dom-C0SgZ5rF.js
assets/rolldown-runtime-B0Z9INg1.js
assets/rum-lJiDKchg.js
assets/shareModel-CBPSscBZ.js
assets/usePresentation-DHPmVFlu.js
assets/useProjectGridDensity-B5YVyt-e.js
assets/visitor-1hiXv0hP.js
```

CSS:

```text
assets/RumPageView-C6gdGYKO.css
assets/profile-header-BTDBvJSt.css
```

