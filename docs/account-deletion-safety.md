# Account deletion: immediate and irreversible candidate, disabled

## 2026-10-16 integrated candidate and current release state

Deletion starts immediately after verified typed-email confirmation and cannot be undone. Immediate means no intentional waiting window, not that a large or interrupted cleanup has completed synchronously. Until the final checkpoint, show **Deletion in progress** and keep the email reserved.

The production `delete-account` endpoint still returns HTTP 503 before constructing a client or accessing data. The frontend release flag remains hardcoded `false`. The candidate request handler, synchronous processing option and worker default to disabled; both database release gates default to `false`. No worker or scheduler is deployed by this change.

The unapplied Supabase review schema stays in `supabase/pending/account_deletion_safety.sql`, outside the migration directory. The separate D1 fence schema stays in `docs/pending-d1/account-deletion-fences.sql`, outside auto-applied drizzle. The integrated candidate has no reversible content markers, waiting deadline or cancellation RPC/UI. It does not enable deletion.

## Ownership and cascade rules

| Relationship | Candidate rule |
|---|---|
| Conversation to either participant profile | Nullable, SET NULL; preserve conversation ID and shared history |
| Message to sender profile | Nullable, SET NULL; preserve message ID and timestamp |
| Message to conversation | Existing CASCADE remains; account deletion never deletes conversations |
| Attachment to message | Existing CASCADE remains; preserve rows and remove only departing sender's file references |
| Comment to author | Nullable, SET NULL; tombstone departing author's comments on surviving projects |
| Comment to parent/root | SET NULL; another participant's replies must not cascade away |
| Profile to Auth account | Existing owned-resource CASCADE remains, guarded against bypassing the lifecycle |
| Projects, categories, drafts and project media to owner | Remove exclusively owned resources; own projects precede categories with RESTRICT |
| Deletion job to Auth/profile | No FK; immutable owner IDs, reservations, checkpoints and fences survive removal |
| File manifest to deletion job | RESTRICT; recovery evidence cannot cascade away |

Authenticated direct profile DELETE stays revoked. Browser roles cannot execute lifecycle RPCs, read private jobs/manifests or alter lifecycle/tombstone fields. Nullable membership uses explicit true/false checks, blocking unrelated users.

## Ordered deletion and recovery

1. **Verify identity, recent sign-in and consent.** Verify the exact bearer token with the Auth provider using `getUser(token)` and signature-validating `getClaims(token)`. Compare the claims subject with that verified account, the configured project issuer, authenticated audience/role and a non-anonymous identity. Require an explicit password, OAuth, OTP, magic-link or SAML sign-in AMR timestamp within the previous five minutes; reject missing, stale, future, unverified or unknown evidence. Token refresh, JWT `iat`, account-wide `last_sign_in_at`, recovery/signup/email-change events and editable metadata never satisfy this rule. Compare typed email with the verified account email and ignore request-body account IDs/timestamps/claims. The service-only request RPC rechecks the timestamp against database time and locks the exact active `auth.sessions` row for that account before creating the irreversible job. Offer export before confirmation. Unverified or mismatched requests are never consent.
2. **Lock and mark deleting.** In one transaction, lock the verified account, insert/reuse its durable job with immutable account/profile/project IDs and reserve its normalized email. Internal status is immediately `deleting`; external status is `processing`. Job-based fences reject uploads, moves, messages and owned-content writes. Duplicate requests return the same job, without reversible content markers.
3. **Claim and Storage checkpoint.** Claim an unleased job immediately with `FOR UPDATE SKIP LOCKED`, a fresh token and a five-minute lease. Build the exact private `(bucket, path)` manifest from exclusive ownership. Remove at most 100 objects per Storage API batch; checkpoint only after every submitted object is confirmed absent from metadata. A lost reply safely repeats the same immutable objects. Failed/uncertain batches never advance to anonymisation. Reconcile owned namespaces to zero before the Storage checkpoint. Never remove production bytes directly through `storage.objects`.
4. **Anonymisation checkpoint.** In one transaction, preserve shared conversations, replace departing message text with `Message removed`, null the sender and set the tombstone timestamp. Remove only that sender's attachment paths/names and null their participant slot. Tombstone their comments on surviving projects while preserving others' replies. Delete their owned projects/profile. Checkpoint only after the transaction succeeds. Surviving UI shows **Deleted User**; other people's messages and attachments stay unchanged.
5. **D1 cleanup and checkpoint.** Send the immutable job/account/owned-project manifest to the purpose-specific internal Sites endpoint. Its atomic batch installs permanent identity/project fences, removes the account's private engagement/activity data and owned-project interactions, and tombstones the departing account's comments on surviving projects while preserving other participants' records and anonymous signals for surviving projects. The worker accepts only explicit `completed:true` with the exact job and canonical manifest digest, then checkpoints those exact IDs under the current lease in Supabase. Missing configuration/schema, network uncertainty, a failed batch or a lost reply never advance to Auth. Retry the same immutable scope; existing durable D1 fences reject new insert/update races even after Auth removal or disabling an application flag.
6. **Auth last.** Enter only after Storage, anonymisation and durable D1 checkpoints. Verify the exact immutable Auth account ID, delete it, and confirm absence with the provider. After a lost acknowledgment, only explicit provider not-found proves absence. Network/authorization failures, empty ambiguous answers or mismatched IDs require retry, never success.
7. **Complete and release email.** Confirm Auth absence, all earlier checkpoints and zero owned Storage objects. Mark the job `completed`/`complete` in the final transaction. Only then release the email reservation and report `isDeleted: true`. Auth absence alone never completes a job. Ownership fences remain after Auth/profile removal to block late uploads and D1 writes.

The private email reservation fences Auth inserts/email updates matching incomplete jobs. Normalization follows existing email rules without invented alias mapping. After completion a new account may use that email with new identifiers. Actual provider compatibility of this Auth-schema trigger is an integration requirement, not established by PGlite.

Retries resume the last durable phase. Sanitized failures retain jobs, manifests, reservations and fences. Expired leases are reclaimable; stale tokens cannot checkpoint, anonymise, complete or fail the replacement lease. An older Storage request may repeat the same immutable owned object, but cannot select another owner. Lease/retry timing is recovery, not an intentional product delay.

## Exact file ownership and fences

- `avatars/{auth_user_id}/...`
- `project-covers/{profile_id}/...`
- `project-media/{profile_id}/...`, including drafts and multipart parts
- `project-media/posts/{owned_project_id}/...`, including rendered PDF pages
- `message-media/{sender_profile_id}/{conversation_id}/...`

Conversation membership is never file ownership. Either direction of mismatched attachment ownership stops the job for review: neither a departing message referencing another owner's file nor a surviving message referencing the departing namespace is guessed at or silently deleted.

Storage metadata fences take the same account lock as the request and cover insert, move/update and unauthorized removal, including service-role PDF/TUS writes. Queued PDF jobs cannot be newly claimed for a deleting account; late progress/completion/retry writes are rejected. Owned processing rows disappear with owned content at anonymisation. Completed-job ownership IDs fence delayed uploads after Auth/profile removal.

## User copy, export and Terms

Before confirmation: **Deletion starts immediately after confirmation and cannot be undone. Export your work and save original files first. Your profile, projects and uploaded files will be removed. Shared conversations and other participants' messages and attachments remain; your messages are removed and attributed to Deleted User.**

Keep existing export before the typed-email field. Portfolio PDF includes public work; bibliography includes references. Neither is a complete archive of private/hidden work or original bytes. State this and tell the person to save originals separately; never call it a full account backup or imply deletion waits for export.

Accepted/retrying jobs show **Deletion in progress**, without deadline/cancellation controls. A status-check failure must not clear progress or claim completion. Closing the sheet never revokes an accepted request. Only verified completion may clear the local session and display email availability.

The final operative Terms deletion clause must reflect immediate/irreversible/export-first wording and shared-content preservation. Review the launch policy drafts, versioning and any re-acceptance requirement separately before release. This deletion candidate does not make a draft operative or change citation/view-only permission versions.

Deleting an owned project removes its comment section. Replies on someone else's project survive; independently copied/quoted content is not owned by the departing account. Provider caches/issued URLs need integration checks; the app does not promise all distributed copies disappear synchronously.

## Confirmed owner policies — October 16, 2026

- **Handle reuse:** immediate reuse, with no additional reservation period. Removing the profile releases its current unique handle and cascades its existing aliases. The synthetic verifier confirms another account can claim both after completed deletion. Email remains separately reserved until the final completion checkpoint.
- **Recent sign-in:** require sign-in within the previous five minutes, proven by the exact provider-verified token's AMR plus an active account/session database row. A refreshed token is insufficient. The existing SDK supplies signature verification; a provider/method that cannot establish this evidence fails closed and needs controlled integration verification before release.

See Supabase's [JWT claim/AMR reference](https://supabase.com/docs/guides/auth/jwt-fields) and [`getClaims` signature verification](https://supabase.com/docs/reference/javascript/auth-getclaims). These documents define the evidence source; the five-minute threshold and immediate handle reuse are the owner's product decisions.

## Private status receipts and remaining integration

The local candidate now prepares a 256-bit random receipt using the server's cryptographic generator **before** the destructive request. Preparation requires the same provider-verified recent sign-in and release gate, and starts no deletion. The browser verifies durable account-scoped storage before submitting typed consent with that receipt. Only its SHA-256 digest, account/job binding and lifecycle timestamps are stored in the private SQL table; browser roles cannot read the table or call its RPCs. Job creation and binding all prepared receipts for that account share one transaction. Duplicate verified preparations can issue independent receipts without invalidating prior ones.

`POST {action:'status',receipt:...}` resolves the digest without an Auth provider call, including after Auth removal. The response contains only `status`, `isDeleted` and generic copy; it contains no identifiers, addresses or receipt. The raw capability never enters a URL or log. It proves only permission to read that minimal status, never permission to request deletion. Unknown, malformed, expired and wrong-account capabilities do not authorize deletion or imply completion. Completion requires both canonical response markers and the durable completed job phase/timestamp. Responses use `Cache-Control: no-store`.

The handler requires explicit `receiptLifetimeSeconds` and `receiptRetentionSeconds` options before either preparation or a deletion request; both are unset by default, so incomplete operator configuration returns 503 before backend access. The first must be a positive integer; post-expiry retention may explicitly be zero. SQL records `expires_at` and `purge_after` for each receipt. Expired receipts cannot read status, and eligible rows are purged opportunistically on preparation/status operations. A production cleanup schedule, expiry/retention values and recovery/support procedure remain separately unselected; no exact retention schedule or availability duration is promised by this candidate. Synthetic test values are not production policy.

Preparation and destructive submission use the captured, provider-verified account's bearer explicitly. The prepare endpoint additionally compares `expectedAccountId` with that verified identity; it does not derive identity from the request body. A current-account check occurs before a prepared receipt is persisted and again before consent submission. The A→B→A account-switch regression verifies that B's capability cannot be stored under A or later accepted as A's completion.

The service API and App-level recovery modal now recover the latest persisted receipt on a fresh signed-out page, including absent-provider session errors. A different active account can access only its own local receipt. The modal shows generic minimal progress only, never account IDs, addresses or raw capabilities; Close hides the UI and never cancels the job, removes an incomplete receipt or globally signs anyone out. Sign-in/password-reset flows defer it. An identifier-free signal releases the MOBILE Welcome overlay only when a valid recovery surface opens. Unknown/expired/unavailable status preserves progress and offers retry and the public support contact, without claiming completion or automatic restoration. Losing browser storage or outliving the configured receipt still requires an owner-reviewed support procedure.

A future edge-function wrapper/gateway must permit receipt status without a live Auth JWT while retaining server verification for preparation/request; the production wrapper remains unconditional 503 here. Actual SDK/gateway behavior after Auth removal and browser/physical-phone acceptance require disposable hosted verification.

## D1 transport and deployment gates

The local worker adapter is `supabase/pending/deletion-d1.mjs`; it uses HTTPS `POST /api/internal/account-deletion/d1` with a dedicated 64-character lowercase-hex HMAC secret, interpreted as UTF-8 text. It must never receive or reuse a Supabase service credential. The exact signature input is `portalink-account-deletion-d1:v1\nPOST\n/api/internal/account-deletion/d1\n` followed by the raw JSON body. The header is `x-portalink-deletion-signature`. The body carries version 1, the immutable job/account IDs, up to 1,000 unique lowercase UUID project IDs, and a five-minute issued/expiry envelope. It is capped at 64 KiB; response reads are capped at 4 KiB. Canonical manifest hashing sorts project IDs and excludes transport timestamps. Unsupported larger manifests fail closed for separate review.

The Sites route additionally requires both `ACCOUNT_DELETION_D1_ENABLED` and `ACCOUNT_DELETION_D1_FENCE_ENABLED`, plus its dedicated `ACCOUNT_DELETION_D1_HMAC_SECRET`. All are unset by default. The worker composition must explicitly supply the approved endpoint URL and the matching dedicated secret to its adapter. Missing/unconfigured adapters prevent new preparation/requests and stop a worker before claims or destructive work. The endpoint requires the separately reviewed pending fence schema and complete trigger/index contract; absent or partial schema fails closed. The Supabase job's `d1` phase, digest and completion timestamp are durable, lease-fenced prerequisites for Auth removal and final completion.

These are local source contracts and synthetic evidence, not applied schemas, installed triggers, live runtime settings, hosted recovery or deployment receipts. No D1 data has been migrated or removed by this task.

## Verification and outstanding release gate

Use synthetic data only. The in-memory PGlite verifier exercises migration history plus the unapplied candidate, never a shared database or real object store. Mocked HTTP tests cover verified identity, consent, bounded batches, failures/retries, explicit Auth absence, completion and hard-off defaults. Frontend tests cover progress, duplicate prevention, export ordering and absence of deadline/cancellation. Exact results and limits belong in the dated handoff.

The integrated focused deletion/recovery/worker/D1 run passes 68 tests without skips; the full-history PGlite verifier passes 22 lifecycle checks. These include the receipt isolation regression, fresh signed-out recovery, canonical completion, mandatory D1 ordering and real isolated SQLite fence/rollback checks. Root owns final combined build/type/lint verification and the current integration handoff.

**Do not enable from local tests alone.** A disposable Supabase integration run must verify real object bytes; Storage API/metadata ordering, rejected removal and lost replies; multipart/TUS/PDF concurrency; stale leases; concurrent request/claim transactions and injected rollback. Test actual Auth deletion, email reservation until completion, then new signup with that email. Verify shared conversations/attachments and Deleted User rendering with disposable participants.

Before enablement, review current production-schema compatibility (including cover/privacy functions), the concrete Sites-worker/D1 retention/removal implementation preserving other participants' data, secure status reporting after Auth removal, durable recovery, real provider verification of the confirmed sign-in policy and the Terms change. A consumed historical administrative exception authorizes no further removal or enablement.

Any future migration and request/status/internal-worker release needs separate authorization, initially with every gate off. This preparation authorizes no production SQL, Storage write, runtime change, scheduler, commit, push, publication or deployment.
