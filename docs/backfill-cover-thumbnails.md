# Cover-thumbnail backfill

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

`scripts/backfill-cover-thumbnails.mjs` prepares the same 200, 400 and 800-pixel
WebP variants as new browser uploads. Each size names the **long edge**; the
other dimension follows the creator's cover ratio. The crop is baked once into
the variants. Originals, attachments, PDF pages and project content are retained.

The current release candidate also generates a 1200×630 `social.webp` after
`project_cover_social_supported` confirms the separately approved schema/bucket
capability. Without that RPC it retains three-variant compatibility. See the
[consolidated release approval order](release-review-sites-274.md).

This source is prepared locally. No live backfill, Storage upload, SQL application
or deployment was performed as part of implementing it.

## Offline verification

Run from the repository root with the existing compatible Node runtime:

```powershell
node.exe scripts/backfill-cover-thumbnails.mjs --dry-run --fixture --log logs/cover-thumbnail-fixture.jsonl
node.exe --test tests/backfill-cover-thumbnails.test.mjs
```

The bundled fixture is `tests/fixtures/cover-thumbnails/fixture.json`. It uses
local artwork, a synthetic two-page PDF and a video's stored poster. The command
actually decodes/renders and WebP-encodes those sources, but does not save image
objects or database records. Its only output file is the append-only JSONL log.
No `.env` file is loaded. Fixture selection occurs before any live client or
environment configuration is accessed. `--apply --fixture` is rejected.

The verified fixture run considered eight synthetic projects, prepared three
eligible covers/nine WebPs totaling 29,004 bytes, skipped five ineligible projects
and failed none. The skips demonstrate private profile, hidden project, hidden
portal, an existing thumbnail and an unsupported audio cover. The selected PDF
cover is page two. A test replaces `fetch` with a throwing function during this
run, checks actual WebP headers/dimensions and confirms page two's blue artwork.
These are local fixture results, not hosted data or performance measurements.

## Preconditions for an explicitly approved live run

The separately reviewed [schema and private-storage policy](../supabase/migrations/202609300001_cover_thumbnail_schema.sql)
must be applied first. The CLI checks for `projects.cover_thumbnail` before doing
work and stops without uploads if it is unavailable. Persistence uses only
`set_project_cover_thumbnail(p_project_id, p_expected_revision, p_manifest)`;
the script never applies SQL, creates a bucket or updates a project directly.

If the separately reviewed [public bucket bundle](../supabase/migrations/202609300002_project_covers_public_bucket.sql)
has been applied, the existing public `project-covers` bucket is preferred.
Otherwise the existing private `project-media` bucket is used. The public bundle
must include the upload visibility locks and hide/delete guards, including their
service-role behavior; merely creating a public bucket is insufficient. Changing
public work to private requires the application's public-object cleanup flow.
Already cached copies of previously public images cannot be recalled.

Supply these environment variables explicitly in the operator's shell:

- `SUPABASE_URL`: existing HTTPS Supabase origin.
- `SUPABASE_ANON_KEY`: existing publishable/anonymous key for visible-record reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server credential for existing bucket inspection,
  immutable uploads and the guarded backfill setter. Never use a `VITE_*` variable.

The existing `pdfjs-dist` optional dependency `@napi-rs/canvas` provides Node
image/PDF rendering and WebP encoding. It was available and exercised in this
checkout; the CLI reports a prerequisite error if another runtime lacks it. It
does not install dependencies. Videos use a stored `metadata.posterStoragePath`
when one is available. A video without one requires an existing `ffmpeg`
executable on PATH, `FFMPEG_PATH`, or `--ffmpeg <existing-executable>`. Its first
frame is decoded with a 60-second limit and no visible helper window. Poster
generation is verified locally; direct video extraction is implemented but was
not executed because ffmpeg was unavailable in this checkout.

After approval, inspect first:

```powershell
node.exe scripts/backfill-cover-thumbnails.mjs --dry-run --limit 10 --log logs/cover-thumbnail-inspection.jsonl
```

A live dry-run reads public-visible records and their permitted source files,
renders the bytes and records proposed objects. It performs no Storage or
database writes. After reviewing that output and obtaining the task's explicit
authorization for live backfill, use:

```powershell
node.exe scripts/backfill-cover-thumbnails.mjs --apply --fail-fast --limit 10 --log logs/cover-thumbnail-apply.jsonl
```

Omitting `--apply` always means dry-run. Omit `--limit` to process all eligible
rows. Projects are handled sequentially and discovered with stable keyset
pagination so successful updates do not cause rows to be skipped.

Use `--fail-fast` for the approved apply run. It stops after the first per-project
failure (including render, upload, freshness check or manifest persistence), logs
the failure, and returns a summary with `stoppedOnFailure: true` and exit code 1.
No later project is requested from the iterator or processed; a listing page
already fetched can contain later rows. Ineligible/skipped projects do not stop
the run. Completed work and immutable uploads from the failed attempt are retained
for safe resumption. The option also works with `--dry-run` and local fixtures.

## Eligibility, output and resumption

Both listing and freshness checks use anonymous Supabase visibility. A project
must have a public profile, visible portal and visible project. Missing
visibility flags fail closed. Private content never enters the renderer.
Without social capability, non-null manifests are left alone. With it, manifests
without a social asset are regenerated from the current selected source; those
already declaring a social asset skip. This is not an audit/repair of malformed
completed manifests or missing objects referenced by them.

The existing selected cover attachment wins, followed by the first image and
then the first attachment. Image, PDF and video covers are supported. A PDF uses
its selected rendered page when available; otherwise PDF.js renders its selected
page from the original. Multipart originals without an available rendered cover
and originals larger than 256 MiB are skipped with an explicit log reason.
Their originals are not altered; a bounded worker or completed preview is needed.

The manifest is version one, has `frameBaked: true`, and records the exact TEXT
`sourceAttachmentId`, source fingerprint, bucket and variant dimensions/paths.
Shared `coverThumbnailManifest.mjs` helpers keep browser and backfill fingerprints
identical. `sourceKey` hashes the selected attachment ID/path/page/crop; the output
path hash includes the actual encoded bytes and dimensions of all three variants
and the social asset when supported:

```text
PROFILE_UUID/PROJECT_UUID/CONTENT_SHA256/200.webp
PROFILE_UUID/PROJECT_UUID/CONTENT_SHA256/400.webp
PROFILE_UUID/PROJECT_UUID/CONTENT_SHA256/800.webp
PROFILE_UUID/PROJECT_UUID/CONTENT_SHA256/social.webp (capability-gated)
```

Uploads never overwrite an existing object. Public objects carry
`Cache-Control: public, max-age=31536000, immutable`; private fallback objects use
`Cache-Control: private, max-age=3600`. Originals and source paths are unchanged.

Fresh visibility, revision and source fingerprint are checked before **each**
upload and again before the guarded setter. The setter separately checks current
visibility and expected revision. A mid-run edit stops that project. Immutable
uploads from a failed attempt remain available for resumption: a concurrent
successful publication may already reference the same content hash, so automatic
rollback deletion would be unsafe. Public retained paths are explicitly logged.
The pending SQL visibility guards keep hiding/deletion blocked until the
application removes every public version under that project's prefix through
its guarded cleanup flow. Private partial uploads may remain for resumption;
without a committed manifest they are not exposed as project thumbnails.

Rerun the same command to resume. Database state is authoritative: completed
projects are skipped and existing matching immutable objects are reused before
the manifest is saved. The JSONL log records per-project start, object upload or
reuse, completion, skip, failure and cleanup. It contains no credentials, signed
URLs or source file contents. Logs are evidence, not instructions to bypass a
fresh permission check. Failed projects do not prevent the remaining eligible
projects from being inspected unless `--fail-fast` is supplied; this preserves
the existing continue-on-error default. Any failures set the process exit code
to one. Summary counts include only considered projects: `generated` and `bytes`
count completed encodes (even if uploading/persisting later fails), while
`applied` counts successful manifest writes. `failFast` records the selected mode;
`stoppedOnFailure` distinguishes a failure stop from reaching the end or limit.

For ten **eligible** projects this produces thirty variants plus ten social
assets when supported, and ten manifest updates, plus reads and verification
requests. The earlier user-visible count of
ten projects is not a verified live backfill count. Real eligible count, byte
volume and runtime must come from an approved live dry-run; the small synthetic
fixture is not a reliable live cost or duration estimate.

For scheduling only, reserve roughly 2–10 minutes for ten ordinary eligible
projects, plus review time; large PDFs, network speed and video decoding can take
longer. This is an unmeasured planning range, not a verified current-project
runtime. The approved live dry-run must establish the eligible count and actual
duration before choosing the apply batch.
