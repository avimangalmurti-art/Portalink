# Trust and first-publication release

Prepared September 29, 2026. Scope: shared WEB/MOBILE behavior and existing
backend boundaries. All changes are local source; no SQL, Sites publication,
media-worker deployment or GitHub integration has occurred in this task.

## Source and release state

- Task branch: `codex/trust-and-activation` in the isolated worktree
  `logs/trust-activation-20260929` under the desktop checkout.
- Refreshed `github/main`: `ccf405c`. The branch was created there, then
  fast-forwarded to the recorded published source `e64087287e1d55cbaa8c7100d11f2ad46ac8c51a`
  to preserve 29 existing source commits awaiting main integration.
- Last recorded live website: Sites v269, source `e640872`, per
  [the preserved publication receipt](agent-handoff.md). This task has not
  re-audited the hosted database or worker fleet.
- Original checkout source and unrelated untracked folders are preserved.
  No dependency, service binding, account, identifier or storage replacement.

## Changes prepared

| Area | Result |
| --- | --- |
| PDF processing | Explicit browser-role denials, service-only v2 RPCs, lease-token fencing, immutable attempt paths, idempotent completion, deterministic claims and correct page totals. Original files and existing successful previews are retained. |
| Page interactions | Caller-scoped Supabase visibility checks run before D1 activity reads/writes. Inaccessible/mismatched targets fail closed. Existing D1 records remain in place. |
| Account state | Profile cache and engagement requests are scoped to account/session identity; late responses are discarded. Independent like/save success or rollback cannot overwrite the other kind. |
| First publication | Empty Home offers creation and discovery; an owner's empty profile offers Add a project. Existing signup intent resumes into the publisher, with account-bound pending intent/dialog state. Navigation and populated profiles retain their existing design. |
| Share previews | Public profile/category/project links receive escaped text metadata fetched anonymously under existing RLS. Private, hidden, absent or unavailable targets retain generic metadata. Existing brand image remains; no private media URL is published. |
| Verification | Full Node/database CI on Windows/Linux, PDF/video Python jobs, required isolated PGlite runtime, explicit checkpoint exclusions, and repairs to stale tests and Windows checkpoint isolation. Lint excludes ignored QA/release output. |

## Verification and limits

Typecheck, lint and client/server production build pass. Lint has zero errors
and 86 existing warnings; existing chunk-size/build-plugin warnings remain.
The full Node/database runner passes **911/911, zero failures or skips**.
Independent source/privacy/rollout reviews found no remaining blockers.
PDF Python tests pass 9/9 and video Python tests pass 18/18 with existing local
FFmpeg/FFprobe. Database tests use isolated PGlite with synthetic identities;
API tests stub upstream responses and exercise the actual worker handlers.

Browser verification uses explicit prototype placeholders, never real account
writes. Desktop guest creation opens sign-in, then resumes into New project
after synthetic sign-in. The dialog fits at 390px and 430px without horizontal
overflow and dismisses correctly. Mobile guest Home displays both new actions;
Explore the world opens the interactive globe. Temporary QA tab is closed and
the viewport override reset. No physical-phone, hosted upload/Realtime,
production RLS/PostgREST round trip or external social-crawler result is claimed.
The existing React `fetchPriority` warning remains. New CI jobs have not run on
GitHub yet.

## Coordinated release

1. Review the full branch against `github/main`, including the 29 preserved
   source commits, before the separately authorized GitHub PR/merge. Do not
   force-push, reset the desktop checkout or treat publication as a main merge.
2. Read-only hosted preflight: confirm the existing Supabase project, PDF job
   schema, current function signatures/ACLs, queue state and worker inventory.
   Check for the migration ledger without creating or repairing it. Reconcile
   unexpected differences before applying any SQL.
3. Obtain explicit approval for the exact
   [PDF safety migration](../supabase/migrations/202609290001_pdf_processing_safety.sql)
   and matching worker release. Stop/drain **all old PDF workers** and their
   in-flight network operations, then apply only that migration. Do not replay
   historical migrations or backfill media. Verify v2 ACLs and function bodies,
   preserved queue/original records and new lease-token field.
4. Start the matching upgraded PDF worker on the existing hosting arrangement
   only after postflight passes. Legacy RPCs intentionally deny service-role
   execution, so old workers cannot be mixed with the new contract. If hosting
   is absent, keep activation pending; do not provision paid hosting implicitly.
   During a failed rollout keep workers stopped and correct forward rather
   than restoring browser grants or running old workers against the v2 schema.
5. Publish the reviewed website/Sites worker after separate approval. Its D1
   access checks, share metadata and UI changes do not require the PDF migration;
   this website release can be scheduled separately. Preserve existing D1
   bindings/data and packaged migrations. Account deletion remains disabled.
6. Record exact source commit, live Sites version, SQL postflight and worker
   deployment separately. Use synthetic disposable staging fixtures for a
   hosted permissions/upload test if an existing staging environment is
   available. Do not use real private content as a QA fixture.

The immutable PDF attempt design may retain unreferenced private outputs after
an uncertain network response. This deliberately favors preserving successful
pages; garbage collection is separate work. Synthetic PostgreSQL checks do not
establish hosted concurrent-worker behavior or the actual production ACLs.

## Small creator pilot

After the release is verified, observe five willing creators completing one
task: create a profile, publish one existing work item and share its public link.
Use a short session sheet with time to first published project, where help was
needed, upload outcome, whether the recipient understood the work, and whether
the creator returned within seven days. Record aggregate results without private
content, passwords or media copies. No recruitment, messaging, real-user study,
tracking deployment or retention result has occurred in this task.

Use those observations to select the next product change. Keep unfinished
navigation decisions, native apps, broader redesign and infrastructure expansion
outside this release.
