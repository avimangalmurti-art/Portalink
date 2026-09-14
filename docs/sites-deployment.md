# Existing Sites deployment

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
