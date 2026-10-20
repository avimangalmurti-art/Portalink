# PDF hosting deployment package

Prepared October 16, 2026. These files describe two separate processes built from
the existing Dockerfile. They do not create a service, select a paid plan, apply
SQL, start a queue, change secrets or activate Portfolio PDF in Sites. The hosting
provider, region, plan, spending and production operations still need the owner's
decision. Preserve the existing Supabase project and current queue state.

## Process contract

| Process | Command | Host connection | Required secret/configuration |
| --- | --- | --- | --- |
| Portfolio export web service | `python -m portalink_pdf_worker.main --export-http` | HTTPS ingress forwarding to container port 8080 | Existing `SUPABASE_URL`; server-only `PORTFOLIO_PDF_WORKER_SECRET` |
| PDF processing background worker | `python -m portalink_pdf_worker.main` | Outbound Supabase access; no inbound port | Existing `SUPABASE_URL`; existing server-only `SUPABASE_SERVICE_ROLE_KEY` |

Deploy the export process independently from the queue process. The export
process neither claims jobs nor needs the service-role key. Keep that key out of
its environment. For container ingress set `PDF_EXPORT_BIND=0.0.0.0` and `PORT` to
the host's assigned port; the provided Compose example uses 8080. The queue
process exposes no HTTP server and must not be configured as a web service.

Both services need writable temporary disk. Keep the unchanged Dockerfile's
non-root worker user. Size memory and scratch space against the configured
`PDF_PAGE_MEMORY_LIMIT_MB` (default 1024 MiB), input size and a disposable PDF;
do not equate a successful build with a sufficient hosting plan. Start with one
queue process and retain its sequential processing. Increase capacity only after
observing the approved service with representative files.

## Provider-neutral Compose inputs

`compose.export.yaml` and `compose.queue.yaml` are separate deployment inputs so
that the export process can be configured without a service-role credential.
Each builds this directory's existing Dockerfile, runs with an init process and
requires its own configuration before startup. A host may instead use the same
Dockerfile and commands directly. No new database, Redis or public bucket is
required.

The required-value substitutions use Docker's documented
[Compose interpolation syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
The service definitions follow the official
[Compose service specification](https://docs.docker.com/reference/compose-file/services/).

Inject values through the host's environment/secret manager. Do not create a
tracked environment file, paste secrets into commands or use `VITE_*` names.
The Compose inputs do not read the app's `.env.local`. Do not run `docker compose
config` without its quiet option because rendered configuration can contain
secret values.

On an authorized Docker host, from this directory, validate without printing
resolved values:

```sh
docker compose -f compose.export.yaml config --quiet
docker compose -f compose.queue.yaml config --quiet
```

Docker documents `--quiet` as validation without printed output in the
[Compose config reference](https://docs.docker.com/reference/cli/docker/compose/config/).

After approval for the specific host, start each approved process separately:

```sh
docker compose -f compose.export.yaml up --build --detach
docker compose -f compose.queue.yaml up --build --detach
```

These are activation commands, not preparation steps. Do not run the queue
command until the schema coordination below is complete. The export Compose
port binds only to the host loopback interface; configure the host's HTTPS
ingress/reverse proxy to reach it. Do not expose the raw HTTP port publicly. On
managed hosting, use the platform's private service-port binding instead of
copying a loopback publication that its ingress cannot reach.

The queue Compose termination grace is 20 minutes for its existing 900-second
job timeout. If those limits change, increase the host's termination grace to
cover the full in-flight job and bounded network operations before deployment.
Stop new claims, let work drain and stop every old instance before an upgrade.
Do not run old and v2 queue workers together.

## Database and runtime coordination

Portfolio export does not require the PDF ingestion migration or a new database
write. The external references migration was already applied on October 12;
do not reapply it to configure exports. The public export handler remains
unavailable until these server-only Sites values are configured:

| Sites value | Required setting |
| --- | --- |
| `PORTFOLIO_PDF_WORKER_URL` | Approved export service HTTPS URL ending in `/export` |
| `PORTFOLIO_PDF_WORKER_SECRET` | Same secret as the export process, held only in secret storage |

Retain the existing Sites worker and D1 binding. Never put the export secret in a
client bundle, source archive, environment example, screenshot or receipt.

The queue upgrade is a different operation. First inspect the existing project
and old-worker state. Only after separate SQL approval, apply exactly the
reviewed `supabase/migrations/202609290001_pdf_processing_safety.sql` if the live
schema still needs it. Verify the v2 RPC definitions and privileges, then start
the v2 queue with the existing worker credential. Never replay all historical
migrations. The existing [README](README.md#coordinated-upgrade) explains the
lease/ACL upgrade and recovery contract.

## Acceptance and receipt

Use a dedicated disposable project and synthetic files after approval for live
testing. Record evidence for both processes separately:

- Export ingress rejects missing/wrong authorization without rendering. Valid
  requests return a readable PDF with `Content-Type: application/pdf` and
  `Cache-Control: no-store`; no request content, token or signed URL appears in
  logs. The listener has no unauthenticated health route: use the provider's TCP
  health check or an authorized synthetic export.
- The public Sites export contains only anonymously readable, opted-in work.
  Private profiles, hidden work and disabled downloads remain excluded. A
  missing service configuration still produces the existing unavailable state.
- A disposable queued PDF advances through claim, page upload and completion;
  WEB and MOBILE read its pages, the original remains unchanged, and worker RPCs
  remain denied to browser roles. Exercise interruption/reclaim and owner retry
  against that disposable content before calling the queue upgrade complete.
- Record exact reviewed source/image identity, host/service and region, plan
  approved by the owner, SQL application/catalog evidence, runtime configuration
  revision (names only), test outcomes and limits. A deployment receipt is
  separate from a source commit and a Sites version. Physical-iPhone acceptance
  requires an actual device.

On export failure, remove the two Sites export settings to restore its existing
unavailable state, then repair/redeploy the same service. On queue failure, stop
new claims and retain original files, completed previews, queue rows and attempt
outputs. Correct the v2 contract; do not restore unsafe legacy RPC grants or
delete an attempt whose completion is uncertain.

## Preparation verification

The deployment inputs do not change Python behavior, dependencies or the
Dockerfile. Existing synthetic rendering/worker, isolated PDF SQL and video SQL
tests are the available local checks. They do not establish Docker image startup,
provider ingress, actual Supabase Storage ordering, hosted queue operation or
physical-phone behavior. Attach the current run's results to the task handoff.
