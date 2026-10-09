# Mass-launch readiness — proposed rollout, not deployed

Prepared on `codex/mass-launch-blockers` from reviewed main `5151636`.
No SQL, Storage change, worker deployment, monitor registration or Site publish
is authorized by this document. Source, applied schema and deployed version are
separate states.

## Document pages

Per the October 8 steering, there is no new PDF worker host. Publishing reuses
the existing lazy PDF.js loader and WebP canvas path. Documents are processed
sequentially, two variants (800/1600 long edge), at most 60 pages per attachment.
`pageRenderFailures` identifies failed pages; `pageBackfillFrom` identifies the
remainder. Public rendering excludes private projects, private profiles and
hidden portals. Those keep private originals and the PDF fallback.

`supabase/pending/202610090001_document_page_previews.sql` is a **separate Storage
approval proposal**: the current object guard permits only cover filenames.
It extends that guard to `{profile}/{project}/{attachment citation UUID}/{page}-{content hash}-{800|1600}.webp`.
It does not make another bucket public or add anonymous access to originals.
Uploads remain immutable and existing privacy transitions require Storage API
cleanup first. Previously cached public bytes cannot be recalled. The browser
checks `document_page_prerender_enabled`; until this migration is approved and
applied, no page uploads are attempted. Do not enable the old private PDF worker
at the same time: its completion would replace this metadata.

The explicit local backfill defaults to inspection only:

```sh
node scripts/backfill-document-pages.mjs
# Only after schema/Storage approval and apply:
node scripts/backfill-document-pages.mjs --apply
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the calling process's
environment. No `.env` file is loaded, credentials are not logged, and the script
does not delete originals or apply SQL. Existing `pdfjs-dist` and optional
`@napi-rs/canvas` are used, not a second renderer. Backfill processes only visible
documents, up to 5000 pages each, sequentially, with the existing 256 MiB local
source budget and multipart verification. Larger sources stop for manual review.
Server validation requires existing uploaded objects, valid dimensions, owned
documents and visibility at metadata commit. Covers and pages use cached `/media`.

Before/after live waterfalls and transfer totals must be collected **after**
approved SQL/backfill/app deployment. An unchanged production route cannot
demonstrate the proposed prerender path. Do not substitute synthetic timings.

## Connections and compute

| Component | Actual URL/protocol | Pool/cap |
| --- | --- | --- |
| Browser | `VITE_SUPABASE_URL`, HTTPS project API | Auth/REST/Storage/Realtime; never a database password or Postgres URI |
| Sites worker | Same project HTTPS API for anonymous REST/RPC and Auth | PostgREST manages its own database pool; no TCP Postgres clients in this source |
| Proposed MCP in PR6 | HTTPS REST/RPC and Storage, server-only credentials for external cite | Same PostgREST pool; PR6 is separate, not deployed by this branch |
| Local document backfill | `SUPABASE_URL`, HTTPS REST/RPC/Storage | One document and one upload at a time |
| Deletion candidate | `SUPABASE_URL`, HTTPS Auth/Storage/RPC | One leased job, Storage batches ≤100, gates off |
| Future raw SQL server client | Dashboard's **transaction** pooler URI, port 6543, server secret `SUPABASE_TRANSACTION_POOLER_URL` | Max 2 connections/client, prepared statements off; never browser exposed |

Do **not** substitute `postgres://...:6543` for `SUPABASE_URL`: it is not an HTTP
API. Auth, Storage and Realtime cannot use Supavisor. Routing current HTTP RPC
through a new raw-SQL driver would replace authorization/context handling, not
configure a URL. No raw SQL client or pooler password has been added in this PR.
If an explicit PostgREST-to-Supavisor topology is required, it needs a separately
verified provider configuration; it is not established by these changes.

After the Small upgrade, inspect the dashboard connection budget, including
Auth/Storage/PostgREST reserved connections. Keep Supavisor pool size at or below
40% of the database connection maximum when heavily using PostgREST; review
PostgREST's own pool separately. No code assumes a Nano connection maximum.
The Python PDF worker's page memory limit is a process limit, not Supabase compute.
Sources: [Supabase connection management](https://supabase.com/docs/guides/database/connection-management),
[pooling limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits),
[transaction pooler](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Account deletion

`202610090002_account_deletion_safety.sql` is the reviewed candidate with a
numbered pending filename; its body is unchanged and both gates default false.
Apply only once, after production-schema compatibility review. It remains in
`supabase/pending`, not migration history. The existing production endpoint and
client remain hard-disabled. Do not deploy or enable the candidate until the
separate review and provider tests in `account-deletion-safety.md` pass.

Disposable provider target: **portalink-staging** (owner reports ready). Public configuration is designated
`.env.staging.local` at the shared repository root; it was not present when
checked. The service role stays in `SUPABASE_STAGING_SERVICE_ROLE_KEY` in the
operator shell only. It cannot execute arbitrary migration SQL via REST.
Apply the history through the staging SQL editor/PostgreSQL connection, never
the production project. The numbered history currently needs the legacy
`profile_journey.sql` prerequisite before `202610070001`/`0002`; a fresh
replay without it fails on `profiles.show_journey`. Do not apply all pending
files indiscriminately. Pending preview Storage changes still require review.
Required checks remain: rejected/lost Storage DELETE acknowledgements,
TUS/PDF upload fencing, request/cancel/claim concurrency, checkpoint rollback,
actual Auth delete/re-register with the same email, and surviving chat/files.
Synthetic PostgreSQL checks do not establish those provider guarantees.
Existing UI maps a missing participant to `Deleted User`, tombstones removed
messages and disables the deleted-participant composer/profile action. The
Sites/D1 retention/removal contract and durable retry scheduler are additional
release blockers; no real account is a test fixture.

## Uptime and dashboard alerts

Configure these HTTPS monitors with email contact **avimangalmurti@gmail.com**:

| Name | URL | Healthy response |
| --- | --- | --- |
| Public profile | `https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/portalite` | 200, public profile HTML |
| Image citation | `https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/cite/9ae4b24a-446d-41b8-b3a9-1a035ed14fc7` | 200, citation HTML with license/JSON-LD |
| Backend readiness | `https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/healthz` | **After deployment:** 200, `{"status":"ok"}`; 503 for timeout/missing probe/backend failure |

`/healthz` resolves the real public citation anonymously (which also proves
Supabase reachability), with a five-second upstream timeout and no content or
provider error disclosure. It is not deployed yet. Disable that monitor until
the approved release. Use email recovery alerts as well as downtime alerts.

Owner approved UptimeRobot free **5-minute** checks. Owner chose
UptimeRobot and will create the account; no account/monitor has been created here.
[Provider interval documentation](https://help.uptimerobot.com/en/articles/11360876-what-is-a-monitoring-interval-in-uptimerobot).
HetrixTools is a free minute-level alternative if the owner changes that choice.

Dashboard alert proposal: sustained Supabase CPU >80% for five minutes; connection
utilization >80% for five minutes; disk >80%; Cloudflare worker 5xx >1% over five
minutes (with a minimum 100 requests to reduce low-volume noise), and any worker
CPU-limit/exceeded-memory events. Configure recovery notifications and the same
email contact. Verify what alerts the account's plan exposes; Sites-managed
Workers may not expose a customer Cloudflare dashboard. These thresholds are
proposed operational settings, not claims of enabled dashboard alerts.

## CI and release

Existing hosted CI installs locked dependencies, typechecks, lints, builds,
runs the full Node/database suite on Linux and Windows, and Python worker tests.
This branch adds a **350000-byte** gzip gate over the visitor's initial JS/CSS
static import graph (deduplicated). Lazy PDF/editor chunks are excluded from
initial transfer; they remain separately inspectable in the build manifest.
The build guard checks both required VITE variables, then verifies production
host/key in both main and visitor graphs.

CI test jobs deliberately use synthetic keys. A production release build must
use GitHub **environment secrets** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in both `staging` and `production` environments,
never a credentials file. Configure required reviewers on `production`, disallow
self-approval and restrict deployment branches to `main`. Server service keys
must stay in the Site/worker secret manager, never `VITE_*` or artifacts.

CI builds/tests/gates and uploads a staging artifact. Production publication
is manual after approval using those exact bytes, without rebuilding. The
production approval job downloads the staging artifact and verifies SOURCE_COMMIT
and SHA256SUMS. Preserve worker/D1 bindings. No headless Sites API is assumed.
Server paths (Sites worker, separate MCP branch, backfill) use supabase-js over
HTTPS/PostgREST, not direct PostgreSQL. Skip Supavisor: PostgREST owns its pool,
whose ceiling scales with compute. Browser configuration remains unchanged.
No application code assumes Nano limits.

## Video

`videoProcessingCapability` defaults false. Status reads and retry classification
skip `video_processing_jobs` entirely while disabled; native videos continue to
play. Enable only after the separate video schema/worker rollout is verified.

## Review amendments

0001 refuses a changed existing valid 1-5000 pageCount. Owner project visits
retry preparation after private-to-public changes; public/profile/portal guards
run before uploads. Complete capped previews are skipped; concurrent requests
share one promise. The next visit renders pages without requiring republishing.

Numbered 0002 supersedes the historical unnumbered candidate. BEFORE INSERT
supplies delete_after=requested_at+48 hours (column defaults cannot reference
sibling columns); a check enforces it. Partial account/profile indexes serve
pending checks; a GIN index resolves legacy paths after project removal. Storage
fences query only the resolved account, including after Auth/profile deletion.

Staging INSERT latency remains unmeasured: designated staging configuration is
absent while the owner creates the project. Use the staging-only rollback
benchmark in supabase/pending/staging_message_insert_benchmark.sql before/after
on the same disposable fixture, role, job cardinality and compute. Do not use
the onboarding sandbox. No SQL was applied; production gates remain off.

The staging artifact must be built with the intended production public backend
configuration to be promoted unchanged. Production approval checks both entry
graphs against production secrets and rejects a staging-backend mismatch. No
service-role credentials enter either build. Hidden build manifests are retained
in the artifact so checksum and entry-graph verification remain reproducible.
