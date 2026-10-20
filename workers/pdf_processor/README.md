# Portalink PDF processor

This is a long-running background worker, not a browser or Vercel request. It
claims durable jobs from Supabase, downloads the private original, validates it,
renders one page at a time in a killable child process, and uploads RGB WebP page
images to private, immutable attempt paths:
`project-media/posts/{post_id}/pages/{job_id}/{lease_token}/page_{index}.webp`.
Existing completed pages at the earlier paths remain readable and unchanged.

## Required environment

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Optional resource controls have safe defaults:

```env
PDF_POLL_SECONDS=2
PDF_JOB_TIMEOUT_SECONDS=900
PDF_JOB_LEASE_SECONDS=1200
PDF_PAGE_TIMEOUT_SECONDS=45
PDF_PAGE_MEMORY_LIMIT_MB=1024
LOG_LEVEL=INFO
```

The service-role key belongs only in this worker's secret manager. Never expose
it through a `VITE_*` variable or commit it to the repository.

## Run

```sh
docker build -t portalink-pdf-worker workers/pdf_processor
docker run --rm --env-file .env.worker portalink-pdf-worker
```

Deploy the image as a continuously running background worker (for example, a
Render background worker, Fly Machine, Railway service, or a VM). The process
does not expose a public port. Use `python -m portalink_pdf_worker.main --once`
for a scheduler that invokes one bounded job at a time.

This worker requires the existing PDF ingestion schema plus the reviewed forward
migration `supabase/migrations/202609290001_pdf_processing_safety.sql`. Do not
replay historical migrations or apply all migrations to start it. The forward
migration and this worker are prepared source; neither has been applied/deployed
by this change.

## Coordinated upgrade

1. Stop accepting new work in every old PDF worker and let its in-flight job and
   network operations finish, then stop all old worker instances. Keep the
   original files, completed previews and existing queue rows.
2. After the separate database approval, apply only the PDF safety migration to
   the existing Supabase project. It adds a nullable lease token without
   rewriting jobs, replaces the page-total calculation, installs v2 RPCs, and
   explicitly revokes browser execution of worker controls. Legacy unfenced RPCs
   also lose `service_role` execution; old workers must remain stopped. Verify
   the live function definitions/ACLs before starting the new worker. Browser
   roles must have no worker RPC execution; authenticated owners retain
   `retry_pdf_processing`.
3. Start this upgraded worker with the existing server-only credentials. It calls
   `claim_pdf_processing_job_v2`, `report_pdf_processing_progress_v2`,
   `complete_pdf_processing_job_v2` and `fail_pdf_processing_job_v2`. Each claim
   receives a fresh token. Old interrupted jobs become claimable after their
   existing leases expire; this migration does not reset them or enqueue work.
4. Exercise a disposable, authorized PDF through claim, upload and completion
   before enabling additional workers. A build, isolated SQL test, or website release
   does not establish the hosted database/worker state.

Mixed old/new workers are unsupported. A new worker against the old database
fails to find the v2 RPC; an old worker against the new database is denied its
legacy RPC. Do not restore the unsafe grants as a rollback. Restore service by
correcting/redeploying the coordinated v2 contract.

## Guarantees

- PDF identification uses MIME type or `.pdf` extension at ingestion.
- Supabase's global Storage setting is the only file-size boundary; Portalink does not impose a second per-file ceiling.
- Encrypted, empty, fake, and unreadable PDFs fail without rendering.
- Each page is rendered independently with a timeout and memory ceiling.
- Output is RGB WebP, quality 85, encoder effort 4, at 200 DPI up to 2048 px on either axis.
- Progress, initial completion and failure require the current, unexpired attempt token.
- A retryable failure is owner-retryable; a retry invalidates the old token.
- Completed page metadata must name existing objects in that attempt's path.
- Completion is idempotent for the same token and identical page metadata.
- A page failure records a fenced failure before cleaning up that attempt's files.
- A lost completion response never triggers destructive rollback or failure.
- Original source objects are never modified or deleted by the processor.

## Recovery and verification boundary

The 2026-09-28 change reduces WebP encoding effort from 6 to 4 without changing
quality, dimensions, child-process isolation, memory caps or timeouts. It does
not introduce parallel PDF jobs, rendering pools or concurrent uploads.

The safety upgrade keeps rendering and uploads sequential and jobs ordered within
each post, including ties in source position/time. A stalled older attempt cannot
overwrite a successor's pages, extend its lease, complete it or mark it failed.
Expired exhausted jobs become owner-retryable failures. A completed job cannot be
failed by a delayed request.

If completion is uncertain, the worker checks whether its token completed the
job. A negative or unavailable read cannot prove an in-flight transaction will
not commit, so it retains the pages and leaves state to lease recovery. Lost
leases and uncertain failure responses also retain attempt files. These cases can
leave unreferenced private objects; this change adds no garbage collector. Any
later cleanup must verify that an attempt is not active or referenced by completed
metadata. Never delete by the entire project's page prefix.

Run the existing Python tests from `workers/pdf_processor` with its installed
dependencies:

```sh
python -m unittest discover -s tests -p 'test_*.py'
```

From the repository root, point `PGLITE_MODULE_PATH` (or `PGLITE_MODULE`) to an
installed `@electric-sql/pglite/dist/index.js`, then run:

```sh
node --test tests/pdf-processing-safety-db.test.mjs
```

The database check loads real migrations in an in-memory synthetic database,
models direct Supabase browser-role default grants, and executes actual role-
scoped claim/progress/complete/fail/retry calls. It skips if PGlite is absent; CI
must provide the runtime for this check to be meaningful. Worker tests render
small synthetic PDFs and inject lost responses/lease changes. Neither suite is a
live Supabase Storage integration test or evidence of hosted worker deployment.

## Optional Portfolio PDF web process (pending activation)

`python -m portalink_pdf_worker.main --export-http` runs an additional HTTP export
process using the existing PyMuPDF/Pillow dependencies. Keep the normal queue
process running separately; its default behavior is unchanged. `POST /export`
requires `PORTFOLIO_PDF_WORKER_SECRET`. Configure the same server-only secret in
the Sites worker, whose `PORTFOLIO_PDF_WORKER_URL` points to this process's HTTPS
`/export` ingress. The web process also requires the existing `SUPABASE_URL` to
restrict cover downloads. `PORT` defaults to 8080 and `PDF_EXPORT_BIND` to
127.0.0.1; container ingress can require a 0.0.0.0 bind. Use the host's TLS ingress,
not a directly exposed HTTP listener. Never use a `VITE_*` variable for secrets.

No queue claims, Supabase writes or service-role credentials are used in this
mode. It limits payloads/concurrency, cover size/time and rendering time, and
does not log content, auth or signed URLs. See
[`docs/references-and-exports.md`](../../docs/references-and-exports.md) for the
review/activation checklist. Nothing has been deployed or configured by this task.
