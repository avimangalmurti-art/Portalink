# Portalink PDF processor

This is a long-running background worker, not a browser or Vercel request. It
claims durable jobs from Supabase, downloads the private original, validates it,
renders one page at a time in a killable child process, and uploads RGB WebP page
images to `project-media/posts/{post_id}/pages/page_{index}.webp`.

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

Apply `supabase/migrations/202608250001_pdf_processing_pipeline.sql` before
starting the worker. The migration is the ingestion handler and queue contract.

## Guarantees

- PDF identification uses MIME type or `.pdf` extension at ingestion.
- Supabase's global Storage setting is the only file-size boundary; Portalink does not impose a second per-file ceiling.
- Encrypted, empty, fake, and unreadable PDFs fail without rendering.
- Each page is rendered independently with a timeout and memory ceiling.
- Output is RGB WebP, quality 85, encoder effort 4, at 200 DPI up to 2048 px on either axis.
- A page failure attempts cleanup before recording failure; see the concurrency limitation below.
- Original source objects are never modified or deleted by the processor.

## Performance and concurrency boundary

The 2026-09-28 change reduces WebP encoding effort from 6 to 4 without changing
quality, dimensions, child-process isolation, memory caps or timeouts. It does
not introduce parallel PDF jobs, rendering pools or concurrent uploads.

The existing PDF RPCs identify jobs without a per-attempt lease token, and page
paths are reused with upsert. A stalled earlier attempt or uncertain completion
can race a later attempt's writes/cleanup. Before increasing concurrency, prepare
a coordinated database/worker change for token-fenced progress/completion/failure,
immutable attempt paths, and conservative uncertain-completion cleanup. A generic
process-pool future timeout is not a replacement for the current killable child
process or its hard resource limits. No such protocol or deployment change is
included in the encoder adjustment.
