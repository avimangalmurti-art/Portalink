# Bounded read-path and media-processing improvements

On 2026-09-28, the owning task applied all six approved performance migrations
(`202609280001` through `202609280006`) to the existing Portalink Supabase project.
Every transaction succeeded. No historical migrations were replayed, and the
absent migration ledger was not created or repaired. Website v266 is published from
source `972392087eeabcf08bc249bd4620ba51376cd279`. Its successful deployment includes
the approved D1 index; independent index-catalog confirmation is unavailable.
PDF/video worker changes remain source only, with no hosting or deployment performed.

Live catalog checks confirmed 18 non-video indexes ready, four expected triggers
correctly defined and enabled, and 14 messaging plus three Storage policy
definitions. Realtime activity has participant-only SELECT and no client INSERT
policy; the earlier restricted typing policy remains. The conversation-state
table is published with RLS enabled. All 15 checked function bodies match reviewed
source by MD5 after whitespace/comment normalization; security flags, search paths
and explicitly specified ACLs match too. Existing participant/summary functions
retain anonymous EXECUTE grants with PUBLIC revoked and authenticated allowed.
The identity and Realtime-version helpers are authenticated-only; the broadcaster
denies browser execution.

`202609280001_performance_read_paths.sql` adds missing foreign-key/read indexes,
including profile/project ordering, conversation unread scans and expired PDF
worker leases. It keeps existing indexes and data. Its transaction uses ordinary
index creation, not an online concurrent-index deployment script.

The live `public.video_processing_jobs` table was confirmed absent. The reviewed
conditional guard skipped three video indexes and the video output policy; this
application did not install a pipeline, enqueue jobs or backfill video data.

Private Storage policies now cast safely parsed path segments to UUID instead of
casting indexed IDs to text. Invalid paths fail closed. PDF pages retain their
owner/public/accepted-follower visibility, and message uploads still require the
uploader's profile, an active conversation and the existing interaction rules.
For installations with the video job table, the conditional processed-video
lookup uses equality after stripping only canonical six-digit part suffixes,
retaining completed-job RLS plus explicit project visibility. The previous
policy's jobs subquery already had RLS; this is an indexability and
defense-in-depth change, not evidence that live private videos were exposed.
That optional branch was not applied to the current hosted schema.

Multipart original validation still runs on every insert and whenever its path,
size or multipart metadata changes (including removal). Unrelated playback or
cover-frame updates no longer re-count every uploaded original part. No audience,
bucket public flag, original content, worker RPC, auth setup or stored profile
layout changes.

Isolated coverage is `tests/performance-read-paths-db.test.mjs`, using all prior
migrations in temporary PGlite via `PGLITE_MODULE_PATH` (or `PGLITE_MODULE`). It
checks repeatability, unchanged content/buckets, invalid paths, anonymous/public,
hidden/private, owner/follower and chat-only access, message restrictions and
multipart update validation. The 19 focused read-path/database checks pass; they
remain separate from hosted catalog verification and do not establish a live
authenticated Storage or upload round trip.

`202609280003_atomic_arrangement_engagement.sql` adds three authenticated,
security-invoker arrangement RPCs. They lock the owned profile and affected rows,
validate IDs before writing, and commit the requested order as one transaction.
Profile wall ordering retains negative positions and appends omitted work;
category ordering replaces only that category's existing wall slots. Visibility,
pinning and portal icons follow their existing arrangement inputs. No RPC writes
`project_grid_columns`. The old table RLS remains enforced, and the isolated test
includes a deliberately failing update trigger to verify rollback without a
partially saved order.

The same migration adds `project_engagement_summaries(p_project_ids uuid[])`,
limited to 200 supplied IDs. It returns one row per distinct visible project:
`project_id`, `like_count`, `save_count`, `repost_count`, `comment_count`,
`viewer_liked`, `viewer_saved`, and `viewer_reposted`. Missing/inaccessible IDs are
omitted. The security-definer aggregate keeps the existing single-project
function's owner/public/accepted-follower boundary and also hides projects in
hidden portals, matching direct project/feed reads. The owner retains access.
Viewer flags use
the current authenticated account, never a caller-supplied account ID. Existing
single-project RPCs remain available while clients switch to the batch call.

`202609280006_messaging_read_identity.sql` adds a stable, authenticated-only
`current_profile_id()` helper backed by the existing unique account/profile
relationship. Messaging ownership predicates use scalar identity lookups, and
message reads use the existing RLS-filtered participant conversation set. The
unread summary compares sender IDs against a materialized viewer ID rather than
calling `owns_profile` for every message. Active/request/blocked receipt and
interaction gates, direct-insert revocations and all write privileges remain.
The isolated test compares nine tables plus summaries before/after for five
viewer identities, and compares 21 write outcomes. An instrumented helper also
verifies at most two identity lookups for each conversation/message read
statement (one per participant equality predicate), rather than one per row.

Worker details and limitations are in [PDF processor](../workers/pdf_processor/README.md)
and [video processor](../workers/video_processor/README.md). The PDF change is
encoder effort only. Video conversion gains a verified compatible-stream remux
path and two bounded multipart uploads while preserving attempt fencing. Existing
container limits, lease protocol, original preservation and job deadlines remain.

## Remaining database and PDF work

- The attachment limit check counts per inserted source, but the existing cap is
  105 and the indexed count is serialized with a project row lock. Changing it
  to a statement trigger alone would not help the publication/update RPCs that
  insert one file per statement. A bulk-write redesign must retain row locking,
  atomic rollback, media validation and job enqueue behavior. Measure a 105-file
  publication's database time before replacing this bounded check.
- PDF progress reports update the page count and lease; they do **not** call
  `refresh_pdf_post_status` on every page. Aggregation runs on enqueue and job
  state changes, including completion/failure/retry. Removing that function on
  the assumption that it runs per page would be a misplaced optimization.
- Full page metadata remains in the job, attachment and project summary.
  Attachments supply the viewer's rendered pages; the current browser has no
  `projects.pdf_pages` consumer, but removing persisted fields/RPC outputs needs
  a coordinated compatibility decision. Measure JSON sizes, refresh execution
  time and write volume on large documents first. Any incremental summary must
  still handle retries, attachment removal/order, failed jobs and page offsets.
- PDF rendering pools, parallel page uploads and immutable thumbnails require
  attempt-fenced worker RPCs and paths before increasing concurrency. Current
  progress/completion/failure RPCs use only job IDs, fixed page paths can be
  overwritten, and uncertain completion can race cleanup. This is correctness
  work, not merely a tuning measurement. Preserve per-page hard memory/CPU
  limits and killable wall-time limits in any replacement worker architecture.
- Legacy PDF worker SQL revokes `PUBLIC` execution, which does not prove that
  hosted direct browser-role grants are absent. A future worker protocol review
  should inspect actual ACLs and explicitly restrict worker controls to the
  service role. This task neither assumes a live grant nor changes that protocol.

No cleanup cron, retention deletion, worker scaling or metadata removal is
included. Production query plans, hosted timings and physical-device playback
remain separate verification from the isolated tests.
