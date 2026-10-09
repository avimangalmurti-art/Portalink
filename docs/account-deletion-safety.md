# Account deletion: immediate-deletion candidate, disabled

October 8 launch-readiness preparation: the byte-identical reviewed SQL body is
also staged as `supabase/pending/202610090002_account_deletion_safety.sql` for a
numbered rollout. Apply one candidate once, never both files. Both database
gates remain false. `supabase/pending/deletion-endpoints.mjs` adds a no-startup
request/status/cancel/internal-tick adapter with both runtime gates off.
Production endpoint/client remain hard-disabled. Disposable portalink-staging
is being created by the owner; provider checks have not run there yet. See
[scaling readiness](scaling.md) for remaining rollout and evidence gates.
No production deletion, SQL, endpoint deployment or scheduler is enabled.

## October 4 immediate-deletion revision

The user explicitly requested no 48-hour waiting period and immediate reuse of the email after confirmed deletion. This supersedes the old grace-period product decision described in the historical review below. The pending schema now makes a request due immediately. The candidate handler can run a bounded deletion tick for only the verified caller and returns completed/isDeleted only after Auth absence and Storage reconciliation are confirmed. Large or failed jobs return processing and require a durable retry worker; they do not promise that the email is free yet. Cancellation remains possible only before a worker claims the job, with no guaranteed cancellation window.

Project-covers is now included in the file manifest and upload/move/delete fences, using the existing profile-owned path namespace. Synthetic tests cover departing/surviving cover ownership and late uploads. Shared conversation/message/comment preservation remains mandatory. Production endpoint and frontend flag remain OFF; no SQL, Auth deletion, runtime deployment, or scheduler was performed.

Release still requires: current production schema compatibility (including published cover/privacy functions), a concrete Sites/D1 removal/retention implementation preserving other members� data, durable retry scheduling, provider Storage/TUS/PDF concurrency tests, deleted-user rendering, actual Auth deletion followed by a new signup with the same email, and review of the resulting release. No disposable Supabase integration project is currently connected in this task. Do not enable from synthetic test results alone.

Local revision verification:17 Node tests and13 in-memory database checks pass, plus typecheck and focused lint. Historical grace-period wording below documents the older proposal, not the currently requested behavior.


The production `delete-account` endpoint returns HTTP 503 before creating a client or accessing any account, database row or file. The frontend release flag is also hardcoded off. No permanent deletion worker or scheduler is deployed.

The replacement schema is in `supabase/pending/account_deletion_safety.sql`, deliberately outside the migration directory. It has **not been applied to production**. Its request and worker gates both default to false. The candidate HTTP handler and worker have no startup side effects and default to disabled.

## Ownership and cascade rules

| Relationship | Previous rule | Candidate rule |
|---|---|---|
| Conversation → participant profile (both columns) | NOT NULL, CASCADE | Nullable, SET NULL; preserve conversation ID and history |
| Message → sender profile | NOT NULL, CASCADE | Nullable, SET NULL; preserve message ID and timestamp |
| Message → conversation | CASCADE | Unchanged; account deletion never deletes conversations |
| Attachment → message | CASCADE | Unchanged; preserve message and attachment rows, null only departing sender's file path and mark removed |
| Comment → author | NOT NULL, CASCADE | Nullable, SET NULL; tombstone departing author's text; replies on another person's project survive |
| Comment → parent/root | CASCADE | SET NULL; one comment cannot cascade through someone else's replies |
| Profile → Auth account | CASCADE | Retained for exclusively owned profile; guarded against bypassing the deletion lifecycle |
| Projects, categories, drafts, project media → owner | CASCADE | Retained for exclusively owned resources; own projects removed before categories with RESTRICT |
| Deletion job → Auth/profile | N/A | No FK; immutable owner IDs, checkpoints and upload fences survive deletion |
| File manifest → deletion job | N/A | RESTRICT; recovery evidence cannot cascade away |

Authenticated direct profile DELETE is revoked and its policy removed. Browser roles cannot execute the lifecycle RPCs, read the private job tables, or alter lifecycle columns. Nullable conversation membership checks use an explicit true/false comparison; an unrelated user cannot exploit `NOT IN (..., NULL)`.

## Deletion flow

1. **Request, one database transaction.** Verify the signed-in account with the Auth provider and check the typed email. Ignore submitted account IDs. Lock this account, insert or reuse its durable job, and mark its profile, projects, categories, drafts, message content, message attachments, project attachments and comments `pending_deletion_at`. The job represents the account's `pending` state. Original values and file bytes remain untouched.
2. **48-hour grace period.** Display the earliest permanent-deletion time. Keep the session so the person can cancel. Cancel locks the same job as the worker, clears every pending marker in one transaction and records `cancelled`. It also works when new requests are disabled. The worker cannot claim the job early. Cancellation remains possible after the deadline if irreversible processing has not started.
3. **Claim and fence.** Claim a due job with `FOR UPDATE SKIP LOCKED`, a fresh lease token and a five-minute lease. Requests/cancellations are idempotent. Stale checkpoint tokens are rejected. New uploads, moves and grace-period file removals are fenced, including service-role PDF writes. Queued PDF jobs are preserved and excluded from claims while pending; progress/complete/retry writes are rejected. Cancellation leaves the original queued/processing state available for normal recovery.
4. **Storage phase.** Build an exact private `(bucket, path)` manifest, then remove at most 100 objects per batch through the Storage API. Record each completed batch only after the objects are absent from Storage metadata. A lost acknowledgment repeats the same safe removal; missing objects are treated as already removed. Reconcile ownership namespaces to zero before advancing. Never delete directly from production `storage.objects`.
5. **Anonymization transaction.** Retain shared conversations. Change departing message text to `Message removed`, null the sender, set `removed_at`, and remove only that sender's attachment references and filenames. The UI displays **Deleted User**. Null the departing participant slot. Tombstone their comments on surviving projects. Delete their exclusively owned projects/profile. Other participants' messages and attachment paths are unchanged.
6. **Auth phase.** Check the exact account ID. Delete Auth only after Storage cleanup and anonymization checkpoints. If a prior Auth deletion succeeded but its response was lost, accept only an explicit provider not-found result. A network error, 401 or ambiguous empty response requires retry.
7. **Complete.** Confirm Auth is absent and owned Storage namespaces remain empty. Mark the durable job complete. Retain stable ownership fences to block late uploads after the profile/Auth rows disappear.

The worker records a sanitized phase error and retries from the last durable checkpoint. A lease expiring while an old Storage request is in flight may repeat deletion of the same immutable manifest object; it cannot select a new owner or checkpoint with an old token. No storage cleanup starts during the reversible phase.

## File ownership

- `avatars/{auth_user_id}/...`
- `project-media/{profile_id}/...`, including draft uploads and multipart parts
- `project-media/posts/{owned_project_id}/...`, including rendered PDF pages
- `message-media/{sender_profile_id}/{conversation_id}/...`

Conversation membership is never used to gather files for removal. Mismatched message attachment ownership in either direction stops the job for review: neither a departing message referencing another owner's file nor a surviving message referencing the departing namespace is guessed at or silently deleted.

## User-facing behavior

Deletion is currently unavailable. The copy describes a 48-hour cancellation period, removal of the user's own profile/projects/files, and preservation of shared conversations and other participants' messages/files. A future pending request shows its deadline and **Cancel deletion**, rather than falsely reporting immediate deletion or signing the person out.

After permanent processing, a surviving chat displays **Deleted User**, preserves history and attachments belonging to the survivor, and removes the composer/profile link for the departed account. Existing accepted chats remain readable; outsider access remains denied.

Deleting an owned project also removes that project's content, including its comment section. Replies on projects owned by other people are preserved. Content quoted or independently copied by other people is not owned by the departing account. Existing public caches and already issued signed URLs are not revoked by a pending marker; no immediate removal is promised during grace.

## Validation and remaining release gate

### September 30 readiness review

Account removal is still disabled. A production inventory and local snapshots
do not authorize enabling the candidate or calling Auth deletion around it.
The reviewed administrative request concerns four explicit accounts; no private
account identifiers belong in this document.

The existing 14 Node checks and 13 in-memory SQL checks pass. The SQL verifier
now supplies a synthetic `realtime.send` implementation matching the provider
signature, so September 28 messaging triggers execute during these checks.
It records events locally and performs no network delivery. This repairs a
stale test fixture, not production behavior.

The candidate is **not ready for administrative execution**:

- Its request handler admits only its verified caller; there is no administrative
  operation allowlist, protected-account exclusion or operation-specific claim.
  The worker currently claims any due job. A future administrative path must
  retain the grace period and all durable checkpoints, with self-service off.
- `project-covers` is absent from ownership discovery, manifests and upload
  fences. A separate synthetic experiment with both pending cover schemas
  reproduced an upload during deletion grace that the manifest omitted; the
  cover privacy guard then blocked anonymization. The passing 13-check baseline
  suite does not establish compatibility with these pending schemas.
- Sites/D1 interactions require a separate read and explicit retention/removal
  decision. They are not covered by Supabase comment counts or cascades. The
  scoped live read for this operation found no target-owned D1 rows; the sole
  observed engagement belongs to the protected account and must remain.

Live participant foreign keys still cascade. Before the September 30 reset,
one empty request and its surviving participant's read/state records were in
the cascade scope. The user then explicitly approved a **one-time administrator
exception**, including that empty request, after reviewing the four-account,
four-portal and one-avatar scope and backup limitations. The provider dashboard
operation completed; postflight confirmed only the protected account remains,
its profile/project/portal/draft fingerprints match, and its Storage counts and
D1 data are unchanged. Exact private evidence is Git-ignored in the owning
checkout; see the handoff. No migration, worker release or self-service enabling
occurred. This exception is consumed and does not authorize another removal.

The preservation instruction remains in force for future operations even when
there are no messages. Do not treat a generic request to continue preparation
as another exception or enable the public deletion flow.

Local verification uses **only synthetic data**:

- The complete existing SQL migration history plus the candidate runs in in-memory PostgreSQL (PGlite).
- Tests cover ownership, FK behavior, RLS, nullable-participant attacks, reversible grace, both directions of bad attachment references, no early claim, stale leases, checkpoint retries, late PDF writes, surviving replies and subsequent survivor project deletion.
- Mocked HTTP/Storage/Auth tests cover hard-off defaults, verified identity, bounded batches, interrupted Storage checkpoints, missing objects, Auth success with a lost acknowledgment, and authorization failures.
- Messaging/auth component and service checks and TypeScript validation cover the frontend changes.

**Do not enable on the strength of local tests alone.** A disposable Supabase integration environment must verify actual object bytes and API ordering for rejected Storage DELETE, interrupted multipart/TUS uploads, in-flight PDF uploads and lost Storage acknowledgments. PostgreSQL tests validate metadata triggers, not the provider's underlying object-store operations. Also test real concurrent request/cancel/claim sessions and rollback on injected transaction failures. No live account or file is a suitable fixture.

Before release: review this schema/flow; complete disposable integration tests; apply the reviewed schema as one migration with both gates off; deploy authenticated request/status/cancel and internal-worker wrappers with their flags off; verify existing and deleted-user chat rendering; then separately approve enabling requests and the worker. No enabling SQL, runtime secrets or scheduler are included in this change.
