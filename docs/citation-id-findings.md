# Citation IDs and pending migrations — first review checkpoint

Task branch: `codex/citation-foundation` in `logs/citation-foundation`.
Base: reviewed `github/main` ccf405c; with the user's explicit approval, fast-forwarded only this task branch to published Sites352 source `07ca5f5c50e873fb6041a3b67aef51f34a2091bd`. Main and the live Site are unchanged.

## ID findings

- `project_attachments.id` is an existing TEXT primary key containing the stable Storage object identifier. Reuse it for individual images. It is preserved by metadata and position changes, retitling and portal movement; encode it into one opaque `/cite/<id>` segment. The pending migration also prevents changing an attachment primary key.
- Document pages currently have no independent UUID rows. They are indexed metadata (`renderedPages`, PDF/page processing metadata, attachment plus zero-based page index). Processing-job UUIDs identify jobs, not pages. The pending proposal adds `project_pages.id` UUIDs keyed uniquely by attachment plus source page number. Metadata updates use ON CONFLICT and preserve those IDs; display order is separate.
- Existing visibility is `projects.is_hidden`, with creator privacy and portal visibility. `citation_permitted=false` preserves existing/new public defaults. Public plus explicit permission represents Citable. The strict citable path excludes hidden projects, private creators and hidden portals, including for authenticated owners.
- The inspected schema has `published_at`, not `created_at`. The proposal uses `created_at` if present in the target catalog, otherwise UTC `published_at`. `made_on` is an editable DATE separate from the publication timestamp.

## Pending files

- `supabase/pending/202610070001_citation_foundation.sql`: permission/date fields, persistent page IDs, narrow public resolver, strict citable RLS/view path and editor RPC wrapper.
- `supabase/pending/202610070002_human_citations.sql`: citation records, ownership/self-citation/uniqueness/privacy RLS, note updates, notifications, Journey preferences and shared bundle fields.

Neither proposal is applied. No Storage policies/objects or D1 schema/data were changed. No Site/worker publication, main merge or MCP server.

## Evidence and limits

Eight focused tests passed using isolated PGlite PostgreSQL and pure resolver/Journey tests: permission denial, public view-only resolution, private/unknown 404s, insert/delete ownership, self-cite rejection, pair uniqueness, private-target hiding except the creators, note limit, notification insertion, ID stability and mixed Journey order. This is not a live Supabase catalog or Storage test.

Typecheck/lint and client/worker build checks are being recorded in `docs/agent-handoff.md`. Component screenshot fixtures are synthetic, isolated, ignored QA material; they do not fabricate product entries or prove mobile/live authentication behavior.

Before applying: compare actual catalog/function definitions (especially shared_profile_bundle/update_project), harden malformed and oversized legacy pageCount metadata, exercise full migration dependencies and every RLS role, and review the rollout sequence. Application code currently requires these unapplied schema changes; do not deploy it first.

The implementation is still a draft. Remaining acceptance work includes full signed-out signup/confirmation and new-project citation flow, complete visibility-setting coverage, covers thumbnail reuse, draft reference labels, full project-end layout/mobile QA, and updating/rechecking changed context-menu regression expectations. Likes remain stored and service code retained behind the default-off capability for the next unused-code audit.
