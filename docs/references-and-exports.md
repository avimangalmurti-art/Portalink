# References and exports — review package

This task is source-only. `supabase/pending/external_references.sql` is pending user review, not applied. No worker, runtime configuration, Sites release or merge is authorized until approval. Existing Supabase identities/data and the Sites worker/D1 interaction data are retained. The earlier Terms and immediate session-revocation PRs are separate.

## Product scope

References gains Add reference, a paste/project picker sheet, resolution preview, confirmation, and owner edit/remove. Public project References combines existing Portalink citations and external references. DOI, Web, Book, Portalink and free-text Text labels identify sources. External references never insert into `citations`, notify a creator or affect Cited in.

Existing project and Studio Published/References actions gain Export. Owners can copy their page/image's existing `/cite` plain-text block without citing themselves. A project-wide desktop owner menu uses its first image/page; the mobile reader uses the displayed image/page. Inactive profile rows retain their existing menus.

The existing mobile Studio Overview contains Continue, This week and the two exports. The intentionally unfinished desktop Studio remains its existing development placeholder. Bookmarks, Cited, Journey, profile presentation, visitor entry and signup are unchanged. Published dates are made-on calendar dates; zero reference counts are hidden.

## Resolution and bibliography

Authenticated `POST /api/references/resolve` accepts `{ "input": "..." }`. Crossref supplies DOI metadata; Open Library supplies ISBN metadata. Web metadata is fetched only by the worker, without account headers/cookies. The total upstream deadline is five seconds, streamed responses are capped at 1 MiB, and redirects are manually validated. Private addresses/hostnames and DNS answers are rejected. HTML metadata parsing is bounded and does not execute scripts. Bot challenge pages, missing metadata, failed lookups and timeouts become unverified free text. Nothing is saved before confirmation.

The app writes external references through the existing authenticated Supabase client. RLS checks both the profile's account and canonical project ownership. Read visibility follows existing project RLS, including anonymous public-project reads. Creation timestamps are server-stamped and immutable. The SQL does not grant unrelated access or add citation/notification triggers.

Project/all-project bibliography exports mix both sources. External entries use simple author–year plain text and BibTeX; Portalink entries retain the exact existing `/cite` blocks as requested. Repeated Portalink pages across projects are deduplicated to avoid duplicate BibTeX keys. All-project reference/citation reads paginate. BibTeX and plain text download locally; Copy copies plain text.

## Public Portfolio PDF activation — pending approval

Signed-out-safe `GET /api/exports/portfolio/:profileId` assembles the creator's public Journey using anonymous Supabase permissions, even if the caller sends a session. Private profiles, hidden projects/portals and opted-out PDF downloads are excluded. Covers use validated existing public paths or short-lived anonymous signing. Citation URLs use existing opaque public item IDs, with public project URL fallback. No email, account/session identity or private project content enters the document.

The existing Python PDF processor has an optional HTTP mode using its installed PyMuPDF/Pillow tooling. Run **an additional web process** from the same worker source/image:

```sh
python -m portalink_pdf_worker.main --export-http
```

Preserve the existing queue process and all its configuration. This web process does not claim processing jobs or replace the queue. Put it behind the hosting platform's HTTPS ingress. Do not expose its raw local HTTP listener directly.

Configure these server-only values after approval:

| Location | Name | Purpose |
| --- | --- | --- |
| Existing Sites worker runtime | `PORTFOLIO_PDF_WORKER_URL` | HTTPS endpoint ending `/export` on the additional PDF web process |
| Existing Sites worker secret store | `PORTFOLIO_PDF_WORKER_SECRET` | Shared bearer secret for PDF requests |
| Additional PDF web process secret store | `PORTFOLIO_PDF_WORKER_SECRET` | Same secret, checked in constant time |
| Additional PDF web process environment | `SUPABASE_URL` | Existing project's URL, used to restrict cover downloads |
| Additional PDF web process environment | `PORT` / `PDF_EXPORT_BIND` | Hosting port/bind; defaults `8080` / `127.0.0.1`; container ingress may require `0.0.0.0` |

Never put the worker secret in code, a client bundle or `VITE_*`. No new service-role key is needed by the export process. Missing configuration returns “Portfolio PDF is not available yet.” Cover retrieval is restricted to the configured Supabase Storage origin, capped at 2 MiB with a five-second per-cover timeout and total image budget. Rendering has a 45-second deadline and two-request concurrency limit. The HTTP mode suppresses payload/auth/signed-URL logs.

After source approval, separately approve applying the **single** pending SQL file and configuring/deploying the PDF web process plus Sites release. Verify real authenticated owner writes, anonymous public reads, metadata lookup and public PDF output before declaring activation complete.

## Verification limits

Final local checks: **1,696 Node tests pass (zero failures/skips), 12 Python
tests pass, typecheck and production client/worker build pass**, including main
and visitor configuration guards. Lint completes with zero errors and 111
warnings. The initial full run identified two obsolete Overview fixtures; they
were updated to check the replacement flow and the complete rerun passes.
Draft [PR45](https://github.com/avimangalmurti-art/Portalink/pull/45) contains
implementation commit `2853d01` and the review evidence. Check its current CI
results before merge.

The test package exercises DOI/ISBN/web resolution, deadline/body caps, fallback, SSRF/redirect checks, mixed bibliography, owner RLS and public/private visitor reads in real disposable PGlite, confirmation-before-save, both Overview states, zero counts, calendar dates, exact own citation blocks and public-only 16-project snapshots. Existing Python tests render a real 16-project PDF (eight pages); first/last pages were inspected. Local authenticated HTTP export succeeds and missing auth is rejected.

Browser evidence renders the actual app root/components with **synthetic services and transport**, avoiding production account/reference writes. It verifies mobile 420×912, public project desktop 1280×900, menus, resolution/edit previews, copy and download behavior. It does not establish physical-iPhone behavior, applied production RLS or hosted-worker availability. Live read-only DOI, ISBN and URL API lookups were additionally verified. Screenshots and the synthetic PDF are in [the evidence gallery](evidence/references-20261012/README.md).
