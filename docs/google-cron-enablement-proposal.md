# Cron enablement proposal — review only

Status: proposed, not approved or executed. Existing Portalink Supabase project only. This document does not authorize extensions, SQL, jobs, secrets, provider settings or publication. Based on the [15 October preflight](google-signin-preflight-2026-10-15.md); repeat the read-only checks before execution.

## Proposed change and boundaries

The existing project offers pg_cron 1.6.4 but has no installed extension or cron.job table. Propose enabling that existing package through Supabase Integrations → Cron, then installing ONLY the reviewed `portalink-google-handoff-cleanup` job using `supabase/pending/google_handoff_cleanup_schedule.sql`. The two base/handoff installation transactions must already have created the cleanup function before scheduling it. Do not create a replacement database, use an external identity-document service, enable pg_net, change server settings or grant browser roles scheduler access.

The job calls `public.cleanup_adult_google_handoffs()` once per minute. That function removes expired and completed/failed protocol handoffs and records only last-success time/deletion count. Accounts, identities, projects, agreement receipts and D1 data are excluded. Execution uses the approved database owner; no credentials are embedded in job SQL. The existing schedule candidate refuses missing pg_cron or a duplicate job name rather than replacing anything.

## Separate approval package

| Proposed action | Review evidence required first |
| --- | --- |
| Apply dormant base/handoff installation SQL | Exact file hashes, current object/ACL/dependency preflight, captured function definitions and recovery checkpoint |
| Enable existing pg_cron extension | Owner acceptance of database-wide extension change; confirm supported version, no existing extension/jobs, and relevant Supabase plan/load constraints |
| Install the one named cleanup job | Cleanup function present, correct privileges, schedule/command reviewed, duplicate-name check, approved monitoring owner |
| Enter the Google testing window | The separate test plan, test identities, private preview, credentials/provider/hook actions and initial-window restoration all explicitly approved |

Extension and job approval do not activate Google or set any readiness flags. No action in this table has been executed. Do not apply all migrations or repair the absent migration ledger.

## Proposed execution and acceptance, after approval

1. Recheck target project, pg_cron availability/absence, baseline settings and owned job names. Capture the full approved recovery checkpoint; function hashes alone are insufficient.
2. Enable Cron through the documented Supabase integration. If the supported path fails or requests unrelated configuration/terms, stop for review. Do not change preload/background-worker settings opportunistically. Inspect extension/schema ownership and privileges; browser roles must not gain job administration or handoff access.
3. Apply only the separately approved scheduling candidate. Record its returned/catalog job ID, name, cadence, database, owner and fixed command in protected operations notes. Confirm unrelated jobs are unchanged. Do not log credentials, callback URLs, codes, nonce/verifier values or request bodies.
4. Observe at least three successful SCHEDULED runs in cron job history, then an approved synthetic expired/stalled handoff removed by a scheduled run with no new signup and no manual cleanup call. Observe that a still-valid pending handoff survives. Scope fixture inspection to approved synthetic IDs; preserve accounts and receipts.
5. Compare job history with `adult_google_cleanup_status`. The latter alone is insufficient: application startup and stage transitions also invoke cleanup. Verify a successful scheduled run within the last two minutes, no overlapping/long-running execution, and expected expiry removal within two subsequent scheduled cycles. These are test targets, not a guaranteed deletion SLA.
6. Only after evidence review may the owner mark cleanup verified under separate configuration approval. Leave public activation and final legal verification false throughout this initial test exercise.

## Monitoring and operational ownership

Proposed operator: Avinaash Mangalmurti. Backup operator: **unassigned; identify an authorized person or explicitly accept a single-operator window before scheduling**. No invitations or access grants are authorized by this proposal.

During the maintenance window, operator checks the exact job's recent run status and last success every minute. Any job error, unexpected deletion, missed expiry target, overlap, or last scheduled success older than three minutes stops new OAuth tests and starts diagnosis. If unresolved within five minutes, begin the planned signup recovery; do not set verification flags. Do not automatically terminate database sessions or purge other jobs.

For continued operation after the window, a separately reviewed monitor and notification destination are required; none is configured here. Alerting must not depend solely on a monitor inside the same failing scheduler. Propose seven days of run-history retention scoped to this recorded job ID only. Prepare/review that housekeeping separately; do not apply a blanket deletion to cron.job_run_details or create another job silently. Keep operational evidence in a protected location with an agreed retention period.

One-minute cadence creates 1,440 runs/day. It consumes existing database resources and creates job history. No new paid external service is proposed, but this document does not promise zero incremental cost or acceptable load on the current Nano database. Confirm resource/plan limits and observe duration/load before approval. The scheduler and underlying cleanup are not live-tested yet.

## Failure and recovery

- Installation failure: stop, inspect exact committed objects, and leave Google unavailable. Never rerun a partly completed sequence blindly.
- Job failure: keep registration closed/paused as appropriate; inspect redacted error/status for this job. An approved manual purge may reduce retained protocol data but is not proof of scheduler recovery.
- Signup pause: continue cleanup while paused; protocol data still expires. Use the separate test plan's initial-window exit for ordinary email-signup restoration.
- If the job itself is harmful, separately authorize disabling/unscheduling **its recorded ID only**, after arranging approved cleanup and retention handling. Do not drop the extension as rollback: Supabase warns that disabling it permanently deletes all Cron jobs. Preserve all unrelated jobs.
- Keep an installed but idle extension unless a separately reviewed removal is justified. Do not delete test/real accounts, receipts, content or D1 to roll back this operational change.

## Decision requested later, not now

Approve or revise the extension, exact job candidate, monitoring owner/backup and resource acceptance as a discrete operations change. This proposal remains review-only. The Google maintenance window cannot start until its separate go/no-go checklist passes.

References: [Supabase Cron installation and removal](https://supabase.com/docs/guides/cron/install), [scheduling and job history](https://supabase.com/docs/guides/cron/quickstart). Documentation checked 15 October 2026; recheck before execution.

Local review evidence: 36 focused tests passed, including eight disposable PGlite database tests; no failures or skips. The initial-test reverse transaction is exercised only locally, including owner/acknowledgment/pause requirements, preservation of accounts/receipts/private content, and refusal after public activation. Actual provider restoration, Cron execution and maintenance timing remain untested. Exact candidate hashes: [review manifest](google-operations-review-manifest.json).
