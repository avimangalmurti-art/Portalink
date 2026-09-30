# Cover-thumbnail backfill

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

The separately reviewed [schema and private-storage policy](../supabase/pending/cover_thumbnail_schema.sql)
must be applied first. The CLI checks for `projects.cover_thumbnail` before doing
work and stops without uploads if it is unavailable. Persistence uses only
`set_project_cover_thumbnail(p_project_id, p_expected_revision, p_manifest)`;
the script never applies SQL, creates a bucket or updates a project directly.

If the separately reviewed [public bucket bundle](../supabase/pending/project_covers_public_bucket.sql)
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
node.exe scripts/backfill-cover-thumbnails.mjs --apply --limit 10 --log logs/cover-thumbnail-apply.jsonl
```

Omitting `--apply` always means dry-run. Omit `--limit` to process all eligible
rows. Projects are handled sequentially and discovered with stable keyset
pagination so successful updates do not cause rows to be skipped.

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
projects from being inspected; any failures set the process exit code to one.

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
