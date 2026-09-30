# Public media cache and load timings

## September 30, 2026 — backfill complete; worker fixes approved for publication

The approved Apply completed at **22:41:54 UTC**: **10 considered / 10 generated / 10 applied / 0 skipped / 0 failed**, 47,433 ms. Uploaded **40 new WebPs, 786,466 bytes**, no reused objects: 200/400/800 plus 1200×630 social per project. All 10 manifests and 40 decoded assets match their receipts. Storage now has 97 objects across 4 buckets; all 57 originals retain identity, path, size, ETag, MIME and cache metadata. Fresh read-only selection skips all 10 as already complete, with zero generation/writes. Do not repeat Apply.

Delivery verification stopped on small proxy covers (502), then identified an internal shared-shell redirect and an unsupported worker request option. Local fixes preserve transformed raster MIME (raw masters/social remain WebP), fetch the canonical internal `/share` asset, and replace worker `redirect: error` with `manual`, retaining rejection of all upstream redirects. The lookup correction also covers link previews, RUM owner verification and Reads. Permissions, visibility, configuration and originals are unchanged.

The user approved publication and live verification. **91 focused tests, typecheck, lint (0 errors / 90 existing warnings), and production client + worker build pass.** A built-worker Node harness with real anonymous reads passed UUID-to-handle 301, handle200, both crawler cards and three cover variants200. One prior metadata read timed out into the intended generic-shell fallback; the subsequent complete check passed. This is not native workerd/hosted evidence. Live cache HIT and physical-phone speed remain unverified. Sites276/runtime revision2 remains active until the new deployment receipt is recorded.

Evidence: ignored `logs/backend-activation-20260930/` with `backfill-release-*`, `cover-manifests-postflight.json`, `storage-postflight.json`, `backfill-readonly-postflight.json`, `delivery-diagnostic.json` and `delivery-fix-*`. The backup is the user's confirmed dashboard backup, not a local dump. Previously approved Supabase/Storage/D1/RUM activation remains applied. Deletion/PDF-processing HOLD items and SMTP are unchanged. Earlier retry notes below are historical and superseded by this record.

## Latest cover-backfill retry — September 30, 2026

Latest retry:7 of10 covers rendered locally,3 multipart originals skipped,0 Storage/manifest writes. Multipart support is now prepared and tested locally; no live retry yet. Bucket/config/D1 activation remains as recorded below.

## September 30 activation record

The implementation below is now published in Sites276. D1 `page_timings` is present and runtime revision2 sets `RUM_OWNER_PROFILE_ID` to the approved owner profile. Anonymous access to `/api/rum/summary` returns401/no-store. Existing public-avatar behavior remains; the public project-covers bucket/policies are created, but its historical cover backfill stopped after10 path-format skips with zero uploads. No production cache-HIT or first-cover speed result is claimed in this activation. The stored200/400/800 approach remains unchanged; no image-transformation setting was enabled. See [handoff](agent-handoff.md) for exact receipts and remaining retry. The following source-only statement is historical.

September 30, 2026. ALL platforms. Source and worker implementation only; no publish, push, hosted SQL, Storage writes, runtime configuration changes or backfill.

## Public media

The existing Sites worker now handles `/media/covers/*` and `/media/avatars/*` before SPA routing. The only upstream is the configured HTTPS Supabase project's **public** `project-covers` or `avatars` endpoint. Covers require the existing UUID/UUID/SHA-256/200|400|800.webp layout. Avatar paths require the existing UUID/safe-filename layout. Traversal, encoded extra prefixes, query strings, foreign buckets and unsupported methods are refused. Unsupported `/media/*` routes return 404. Private originals and private thumbnail manifests retain their signed URLs.

The worker uses the Cloudflare Workers **`caches.default`** API, available globally in the Sites Cloudflare-compatible runtime; no new binding. It explicitly matches and puts GET responses, with Accept included in the internal cache key and `Vary: Accept` on the response. Cache writes use the request context's `waitUntil`; runtimes without a Cache API serve the image and report BYPASS. Cache failures do not break image delivery. This is data-center-local caching, not tiered/global replication; hosted behavior remains to verify after a separately approved publication. See [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

Successful covers and UUID/hash-versioned avatars receive `public, max-age=31536000, immutable`. Legacy avatar names receive `public, max-age=300, must-revalidate`, because those names do not establish immutable contents. Responses preserve actual image Content-Type and upstream ETag; a missing ETag is computed from bytes with an 8 MiB bound. GET/HEAD/conditional ETag requests are supported. No incoming Authorization, cookies, IP, UA, redirect, range or conditional header is forwarded to Storage. Only Accept is forwarded. Errors are never cached. SVG avatars use sandbox CSP and nosniff to avoid introducing an active same-origin document.

`x-portalink-media-cache` reports HIT, MISS or BYPASS. It describes the worker cache lookup, not a claim that every edge location already has an object. Existing privacy limits still apply: a formerly public image already downloaded/cached cannot be recalled by deleting its source. The proxy exposes only public buckets; it grants no new access to originals or hidden/private records.

### Transformations and the three-file compatibility limit

A read-only request to an existing public avatar confirmed Storage transformations are enabled: original PNG 512×512 / 323,017 bytes, transformed PNG 200×200 / 45,022 bytes, both HTTP 200. No object was written. The cover proxy therefore derives 200/400 responses from the 800 WebP master with width/height, `resize=contain`, and `format=origin`; 800 uses the raw object. Existing three-entry manifests and real width descriptors still select the requested size.

**Removing the extra stored files is not implemented in this pass.** The existing `set_project_cover_thumbnail` contract verifies the existence of every 200/400/800 manifest object, and the manifest validator requires matching size filenames. Omitting two uploads would break publishing/backfill. This task preserves those writers and that Supabase schema; the smaller proxy responses already use transformations. A separately reviewed Supabase contract change is needed before writers can store only the 800 master. Existing 200/400 files were neither deleted nor backfilled.

Public URLs are rewritten in the read mapper, cover srcset builder, ResponsiveImage and the raw comment-avatar image. Other origins, private signed URLs, local previews and author content remain untouched. Development Vite now reuses the same handler through a serve-only plugin, avoiding SPA HTML responses where previews expect images.

## Timing contract

Both HTML heads mark boot before the entry module runs. The early shared-bundle request records its successful response arrival; the client adopts that timestamp without another request. The canonical Supabase fetch hook observes only content-read paths. Grid image load events mark the first cover on share/profile routes. Actual PDF canvas completion and pre-rendered PDF page-image loads mark the first PDF render on project routes. Auth, mutations, media signing and telemetry requests do not win the data mark. Stale route tokens prevent earlier work from marking a later view.

Each pathname-level page view sends at most one `navigator.sendBeacon` POST, on first background/pagehide or route leave. Query/hash changes, auth dialogs, repeated hide events and BFCache restoration do not duplicate a sent view. Sampling is 100% in production builds; Vite development and explicit prototype mode remain silent. No retry is made when a best-effort beacon fails. If a visitor backgrounds before a metric exists, it stays null in that one sample. Unsupported screens such as Messages, Studio, Settings and Insights are not mislabeled as Home.

Exact JSON fields:

| Field | Allowed value |
| --- | --- |
| route_kind | share, profile, project, home |
| boot_ms, data_ms, cover_ms, pdf_ms | nullable finite milliseconds, 0–86,400,000 |
| vw_bucket | <400, 400-639, 640-1023, 1024-1439, 1440+ |
| conn | slow-2g, 2g, 3g, 4g, unknown |
| version | 7–64 lowercase hex; builds use a 16-character source-content hash |

All timestamps follow the requested **document navigationStart** clock (`performance.now`). For a subsequent SPA view, boot_ms is its route activation on that clock; values can therefore include time spent on preceding screens. These are not isolated SPA transition latencies. A null first-data metric is expected when a cached SPA view needs no read. The source hash excludes environment files and works in a Sites source archive without Git metadata.

No account/profile/project ID, path, IP, user-agent string, raw viewport size, email or referrer enters the beacon body or D1 row. The worker adds only a random row ID and server timestamp. It does not log request bodies or identity headers. Ordinary transport headers/platform infrastructure are outside this application table.

POST `/api/rum` validates exact fields, finite bounds, UTF-8 and a streamed maximum of 1,024 bytes (not merely Content-Length). Extra fields are rejected. Cross-origin requests with a different Origin are rejected. Valid insert returns 204; invalid payload 400, oversized body 413, wrong method 405. Missing D1/schema returns a generic 503 without creating schema. One in 100 accepted requests attempts to delete records older than 30 days. Quiet sites can retain old rows until a later sampled request; this is opportunistic retention, not a scheduled deletion guarantee.

## Owner Insights and pending migration

**Prepared, NOT applied:** [drizzle-pending/0002_page_timings.sql](../drizzle-pending/0002_page_timings.sql). It adds `page_timings` and the `(at)` index to the existing Sites D1 binding, preserving page interactions and saved-media data. No migration journal repair or runtime CREATE TABLE is used.

The September 30 website release moves this unchanged candidate out of
`drizzle/`: Sites automatically packages and applies that directory during
deployment. The release archive includes only the already-established `0000`
and `0001`; approval-only timing SQL is not part of the deployment payload.

GET `/api/rum/summary` verifies the session with Supabase Auth, then verifies that the configured owner's profile row has `account_id` equal to that verified user's ID under the user's RLS. Editable auth metadata cannot grant access. No D1 read occurs before this succeeds. Missing configuration fails closed. The **server runtime** variable is `RUM_OWNER_PROFILE_ID`; it is not `VITE_*`. No owner configuration was found in source or the read-only Sites environment listing, and none was set. The owner's actual profile is still to be supplied/confirmed by the user.

The summary returns nearest-rank p50/p90 and non-null sample counts for each metric/route over 24 hours and seven days. Window aggregation stays inside D1, returning at most 32 aggregate records rather than raw samples. Responses use no-store. The existing Insights page lazy-loads a small table, with both periods and refresh, only after the server confirms platform ownership. Other creators retain personal save/follower insights and see no timing section. The confirmed owner gets an unavailable state while the migration is pending; unverified users do not.

**Approval requested before applying `0002_page_timings.sql` to the existing Sites D1 database.** Configuring the confirmed owner and publishing the source are also separate future operations; this source-only task does neither. Supabase changes needed to remove duplicate stored sizes remain a separate review.

## Verification

- Typecheck and client/worker build pass. Lint has 0 errors / 84 existing warnings.
- 168 focused Node tests pass: media cache/path/header/ETag/SVG tests, exact payload validation and byte limits, nearest-rank SQL SELECT against synthetic values, retention, owner/auth/UI guards, lifecycle/adoption tests, existing worker/page-interaction/share/entry/PDF/zoom regressions. Existing legacy tests create disposable in-memory schemas; the new pending migration was not executed, locally or remotely.
- Local compiled worker with an injected Cache API double, synthetic Supabase HTTP responses and an in-memory D1 interface (no migrations): curl same 200.webp twice returned **200 MISS → 200 HIT**, image/webp, ETag, Vary: Accept and immutable year-long Cache-Control. Unknown private prefix returned404; valid/invalid beacon bodies returned204/400. This establishes the worker code path, not hosted edge cache behavior.
- Browser 390 and1280: covers and avatars loaded from `/media/*`; 200 cover candidates on mobile,400 on desktop; no page-width overflow. Document viewer loaded PDF.js only on open and rendered all three fixture pages. One sample per observed route exit/reload, with PDF render recorded only after document rendering. Representative local share boot/data/cover values232/263/971ms; next project navigation-start values8118/8162/8683ms. These are unthrottled synthetic local timings, not live performance estimates.
- Owner synthetic sign-in preserved `/insights` and showed both timing windows. At390 the wide table scrolls within its section (page width390); non-owner signed-in creator at390/1280 retained personal Insights with **zero** timing panels. Guests see the existing sign-in flow. Owner/non-owner/expired-session/missing-config cases also have behavioral tests.
- Visitor initial graph retains no PDF.js, PDF renderers, video playback or unopened authoring surfaces. RUM's dedicated client chunk is3,160 raw bytes /1,471 local gzip, with232 rendered bytes for the route observer in a shared chunk. No physical-device, hosted-cache, real-account, real D1 or live-speed claim.

Ignored local proof and isolated fixtures are in `logs/edge-rum-qa/` and `logs/edge-rum-*.txt`. They never connect to live services. The transformation capability check was a separate, read-only public Storage request.
