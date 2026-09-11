# Portalink video conversion worker

Creates an H.264/AAC MP4 playback copy of uploaded videos, retaining the original
path, bytes, name and download link. Existing videos are backfilled into the same
queue. MP4/WebM originals remain playable while their compatibility copy is prepared.

## Deployment (not yet activated)

The Sites website host does not run this continuously. Use a separate Docker
background worker, for example [Render Background Workers](https://render.com/docs/background-workers).
`render.yaml` is a ready-to-review Blueprint for one Oregon worker on `1c-2g`
(1 CPU, 2 GB RAM). Confirm the paid price in Render before creating it; this repo
has not purchased or provisioned hosting. Existing Supabase remains the database
and private media store. No Redis, public bucket, or second database is needed.

1. Save this code to the connected Git repository. In Render, create a Blueprint
   pointing to `workers/video_processor/render.yaml` on that branch.
2. Set `SUPABASE_URL` to the existing project URL and
   `SUPABASE_SERVICE_ROLE_KEY` using Render's secret environment fields. Never
   use a `VITE_` variable, commit the key, or include it in browser code.
3. Coordinate the initial deployment: apply
   `supabase/migrations/202609100001_video_processing_pipeline.sql` to the existing
   Supabase project, start the worker, then publish the website playback changes.
   Do not apply the backfill until worker hosting is ready: otherwise existing
   unsupported videos will show queued with no converter running.
4. Verify a short MOV on a dedicated test project: queued → processing → completed,
   correct audio/video in WEB and MOBILE, unchanged original download, and public
   playback with no session. Confirm private/hidden content stays inaccessible.

Render uses the Dockerfile in this directory; manual Docker equivalent:

```sh
docker build -t portalink-video workers/video_processor
docker run --init --memory=2g --cpus=1 --env-file /secure/portalink-video.env portalink-video
```

The process handles one job at a time, constrains output to 1920 pixels, strips
embedded metadata, and uses 40 MiB multipart storage for larger copies. It accepts
local video containers only, with no network protocols or shell invocation in
FFmpeg. Temporary disk must accommodate original plus conversion output; larger
uploads may require a worker with more temporary storage. Rebuild periodically
for FFmpeg security updates. Originals are never overwritten or deleted by this worker.

## Retry and recovery

- Each claim receives a fresh lease token; heartbeats keep it valid for 180 seconds.
- Expired jobs return to the queue; stale workers cannot report success/failure
  against a newer token. Three automatic attempts use bounded retry delay.
- Completion verifies the output path and every stored part/byte count in one
  database transaction before publishing playback metadata.
- Transient failures can be retried by the owning user. Invalid video is reported
  as failed with the original still available.
- A lost completion response retains attempt files because the transaction may
  still commit. Cleanup never deletes files from another attempt or an original.
  Abrupt termination or ambiguous completion can leave unreferenced attempt
  outputs; audit them against `video_processing_jobs.output_path` before any
  administrative cleanup. Automatic orphan garbage collection is not included.
- Project/file deletion includes committed playback copies in ordinary media
  cleanup; failed cleanup continues to report the existing cleanup warning.
- Account deletion remains disabled and is unrelated to this migration.

## Local verification

Install `requirements.txt`, FFmpeg and ffprobe, then run:

```sh
python -m unittest discover -s workers/video_processor/tests -p 'test_*.py'
```

Optional `FFMPEG_PATH` / `FFPROBE_PATH` locate the binaries. Tests generate short
synthetic video fixtures; they do not read or modify user uploads. Database tests
use a temporary PGlite installation via `PGLITE_MODULE` (absolute module path):

```sh
node --test tests/video-processing-db.test.mjs tests/video-playback.test.mjs
```

The isolated PostgreSQL test schema exercises leases, permissions, multipart
completion and backfill. It does not replace a hosted Supabase Storage smoke test
or physical-phone playback verification before activating production conversion.

Verification recorded on 2026-09-10: 11 Python worker/conversion tests passed with
FFmpeg 9.0.1, including real MOV audio, portrait HEVC and non-square pixel input;
25 focused Node checks passed for navigation, playback metadata and the isolated
database migration; 9 existing multipart streaming checks passed. Typecheck,
production build and lint passed (full-repo lint reports 88 existing warnings;
changed TypeScript files have no warnings). The production migration, worker
deployment and website publication for this feature are still pending hosting.
