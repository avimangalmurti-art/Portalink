# Existing Sites deployment

## September 30, 2026 — backfill complete; worker fixes approved for publication

The approved Apply completed at **22:41:54 UTC**: **10 considered / 10 generated / 10 applied / 0 skipped / 0 failed**, 47,433 ms. Uploaded **40 new WebPs, 786,466 bytes**, no reused objects: 200/400/800 plus 1200×630 social per project. All 10 manifests and 40 decoded assets match their receipts. Storage now has 97 objects across 4 buckets; all 57 originals retain identity, path, size, ETag, MIME and cache metadata. Fresh read-only selection skips all 10 as already complete, with zero generation/writes. Do not repeat Apply.

Delivery verification stopped on small proxy covers (502), then identified an internal shared-shell redirect and an unsupported worker request option. Local fixes preserve transformed raster MIME (raw masters/social remain WebP), fetch the canonical internal `/share` asset, and replace worker `redirect: error` with `manual`, retaining rejection of all upstream redirects. The lookup correction also covers link previews, RUM owner verification and Reads. Permissions, visibility, configuration and originals are unchanged.

The user approved publication and live verification. **91 focused tests, typecheck, lint (0 errors / 90 existing warnings), and production client + worker build pass.** A built-worker Node harness with real anonymous reads passed UUID-to-handle 301, handle200, both crawler cards and three cover variants200. One prior metadata read timed out into the intended generic-shell fallback; the subsequent complete check passed. This is not native workerd/hosted evidence. Live cache HIT and physical-phone speed remain unverified. Sites276/runtime revision2 remains active until the new deployment receipt is recorded.

Evidence: ignored `logs/backend-activation-20260930/` with `backfill-release-*`, `cover-manifests-postflight.json`, `storage-postflight.json`, `backfill-readonly-postflight.json`, `delivery-diagnostic.json` and `delivery-fix-*`. The backup is the user's confirmed dashboard backup, not a local dump. Previously approved Supabase/Storage/D1/RUM activation remains applied. Deletion/PDF-processing HOLD items and SMTP are unchanged. Earlier retry notes below are historical and superseded by this record.

## Latest cover-backfill retry — September 30, 2026

Latest continuation changed only the local backfill script, tests and documentation. Dry-run:7 generated/3 multipart skips/0 writes; prepared multipart support has38 passing focused tests and has not run live. Sites276 remains unchanged.

## September 30, 2026 activation snapshot

Sites **276**, source `ed263ea0055155a9231aab2ce8dfd35d0196fe07`, is live at the existing public URL. D1 activation succeeded at19:28:41UTC; the same saved version was redeployed at19:29:17UTC to activate runtime revision2 with the specified RUM owner. Existing Supabase connection, public audience and DB binding are preserved. D1 0000/0001 data is intact and0002/0003 tables are present. No GitHub push/merge. Later local backfill-path repair and final documentation are uncommitted; covers have not yet been populated. The current [handoff](agent-handoff.md) supersedes earlier deployment snapshots below.

GitHub `main` is the source of truth. Publishing the website is a separate operation through the existing Sites project. A GitHub push, successful CI run, or local build does not deploy it. The [quality workflow](../.github/workflows/quality.yml) runs checks and has no deployment step.

## Recorded snapshot

The following was verified by the owning Codex task on **2026-09-14**. Recheck it before a later publication; these values are historical, not permanent current-state claims.

| Item | Recorded value |
| --- | --- |
| GitHub `main` | `5512bd01eaeb9739516bfa19304267d541602ebd` |
| Live Sites version | `248` |
| Source commit for that version | `36e2a02a487035af82315a313dcccdfc215ba805` |
| Existing website | [Portalink](https://portalinknetworksinc.avimangalmurti566055.chatgpt.site) |

At that snapshot, the live source commit differed from `main`. Do not infer that later commits are published merely because they have been merged.

## Publication workflow

1. **Choose the release source.** Follow the [development workflow](development-workflow.md), synchronize with GitHub `main`, and record the exact commit. Use a clean release checkout. Preserve unfinished work in other checkouts; do not reset or overwrite it to prepare a release.
2. **Verify that exact source.** Use the existing compatible Node runtime and lockfile. Run the relevant focused checks, plus `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` for the release. Record failures, warnings, and verification limits. The build produces both the browser client and Sites server worker. If the source changes, update the recorded commit and repeat the affected checks before publication.
3. **Update the existing Sites source mirror.** The owning Codex task uses the available Sites tooling and its current documented workflow to synchronize the reviewed source into the existing project. Reconcile the mirror with the selected commit before versioning it. Preserve the existing `project_id`, `"d1": "DB"`, and `"r2": null` in [hosting.json](../.openai/hosting.json). Do not create a replacement project, database, or storage binding. Preserve configured environment values through the established tooling; never put credential values in this guide or the source mirror.
4. **Create and publish the reviewed version.** Package the verified client/server build, save a Sites version associated with the same source commit, and deploy that version through Sites tooling. Reuse the successful build when source and execution environment are unchanged; otherwise rebuild using the current Sites workflow. Confirm that the deployed version corresponds to the selected source commit. A separate assistant preparing code should hand the commit and check results to the owning Codex task rather than guess deployment commands or create another hosting path.
5. **Verify the result.** Confirm the returned version and existing URL, then check representative WEB and MOBILE entry routes, public shared links, and affected behavior. Check the existing same-origin page-interaction API when relevant; a static page loading does not establish worker/D1 health. Record the commit, Sites version, time, checks, and remaining limits together.

This process keeps the current hosting arrangement. It does not introduce automatic CI deployment or grant standing permission to publish unrelated changes.

## Separate release operations

- **Supabase:** website publication does not apply SQL migrations or Auth configuration. Follow [migration status](migration-status.md) and review each required backend change separately. Presence in `supabase/migrations` does not establish that a migration is applied remotely.
- **PDF/video workers:** these have separate deployment environments, runtime dependencies, and secrets. Follow their [PDF](../workers/pdf_processor/README.md) and [video](../workers/video_processor/README.md) guides only within an authorized worker release. Publishing the frontend does not start processing jobs.
- **Deletion:** preserve the hard-disabled endpoint and frontend release lock. Nothing in this guide authorizes applying `supabase/pending` or enabling account deletion; see [account-deletion safety](account-deletion-safety.md).
- **Credentials and bindings:** keep browser publishable configuration distinct from server secrets. Never copy service-role credentials into `VITE_*` variables, repository files, or handoff notes. Keep the existing project and database connections intact.

See [current architecture](current-architecture.md) for the client, Supabase, Sites worker/D1, and media-worker boundaries.
