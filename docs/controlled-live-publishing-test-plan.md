# Controlled live publishing and recovery test

**Status: PROPOSAL ONLY — NOT SCHEDULED OR EXECUTED.** Prepared 16 October 2026 against Sites439/source `1a51771aa2f79f0bf493abc80c11c2535457272a`. Approval of this document is not approval to run it. Obtain explicit execution approval identifying the selected phases, account and disposable objects before starting.

This is a small production-data test in the existing Portalink/Supabase project, separate from the held Google sign-in, eligibility, Auth hooks, Cron, SQL and legal activation work. No deployment, migration, provider configuration, new account, credentials or infrastructure is proposed.

## Review and approval sequence — scope, operator, cleanup and fault restrictions approved in principle

Reviewed locally on16October2026; no tests, browser actions, live inspection, SQL or settings changes performed in this review. The proposal is not execution-ready yet.

Approval record: user approved PhaseA scope in principle, subject to resolving remaining blockers, and explicitly kept scheduling/execution on hold. This covers only the2portal/4draft/max1unresolved/no-upload/no-publication scope and exact test-object cleanup described in step1. User also approved himself as primary operator using the existing Portalite owner account, with no concurrent publishing/editing during the future window. Exact account/profile IDs still require private reconfirmation. Step3 baseline verification and cleanup method is also approved in principle, subject to verifying existing access and capability. Step4 fault-control restrictions are also approved in principle, subject to verifying a suitable mechanism. Step5 window structure and interruption handling are approved in principle, including possible extended recovery. Step6 final readiness and execution go/no-go remain unapproved, as does PhaseB. No date/time has been selected. Scheduling/execution stay on hold.

Remaining blockers:

- Read-only readiness review confirmed the existing Portalite profile/account mapping and recorded8 owner portals,16 owner projects and0 drafts on16October2026. Refresh the exact identity and complete baseline immediately before any future run; no window is booked.
- Existing Table Editor row reads are demonstrated in docs/phase-a-readiness-review-2026-10-16.md. Exact-ID filter/absence verification and interrupted/orphan cleanup procedures remain unverified; exceptional admin deletion remains separately reviewable. UI disappearance alone cannot establish cleanup. In particular, closing while draft creation is unresolved can leave a late-created row; wait for its ID/outcome before close, and reconcile an interrupted insert before retry.
- Method/filter-specific, tab-local fault controls are not available in the current automation. A reviewed operator mechanism is still required for A1/A4. A whole-host or URL-only blocker that cannot distinguish the intended operation is not an acceptable substitute. Automatic removal after30seconds is not established; an interruption could leave a rule active, so remove rules first on recovery and do not present30seconds as a guaranteed cutoff.
- A scheduled time commitment and final go/no-go approval are still absent; the primary operator/account arrangement is approved in principle. Reconfirm the live release and absence of concurrent owner edits just before execution.

Ask for approvals one at a time, in this order:

1. **PhaseA scope in principle:** up to2 disposable portals and4 server drafts total, maximum1 unresolved draft, no files/uploads/committed projects. Includes normal UI deletion/discard of exact run-owned objects, including the stale empty portal. Innocuous portal names may briefly appear publicly. Pre-existing content is excluded. This decision authorizes neither scheduling nor execution.
2. Confirm existing owner account/profile, operator and no-concurrent-edit arrangement; exact IDs remain private in the run ledger.
3. Review the baseline inspection and exact-ID cleanup/recovery method, including orphaned draft recovery and final destructive confirmations. Do not assume admin cleanup is already authorized.
4. Review the concrete fault-control method and failure-stop behavior. If unavailable, review a reduced PhaseA scope explicitly; skipped injections cannot be called full PhaseA acceptance.
5. Confirm the60minute window structure,35minute creation cutoff/25minute recovery reserve and interruption handling; scheduling stays pending until explicitly agreed.
6. Review the completed readiness evidence and exact disposable run labels/ledger, then request explicit execution go/no-go. Approval in principle from any earlier step is not this authorization.

PhaseB remains excluded from PhaseA approval. Its uploads/private publication and cleanup require a separate later decision. Held Google/Auth/SQL/provider work remains outside every approval in this sequence.

## Approval3 — baseline inspection and exact-ID cleanup approved in principle

Approved in principle subject to access/capability verification; scheduling/execution remain held. No inspection or cleanup has been run.

- Before test writes, use the operator's existing signed-in Supabase dashboard in read-only mode to record the chosen owner/profile and baseline portal, project and draft IDs/counts. Verify exact rows in Table Editor; do not execute SQL, obtain new keys, grant access or alter settings. Store the ledger locally in ignored run evidence without credentials.
- During the future approved run, record every returned test portal/draft ID. A test label alone is never sufficient to authorize deletion. Keep pre-existing rows out of scope and permit only1 unresolved draft.
- Prefer normal Portalink discard/delete for exact test-owned objects. Recheck owner/profile, recorded ID and run creation evidence before final destructive confirmation. Verify removal through an exact-ID dashboard read, not just UI disappearance. Remove the recovery portal last, after all its test drafts are verified absent; no cascade cleanup shortcut.
- If a tab interruption or failed discard leaves an orphan without a working app cleanup path, stop new tests. Prepare a private, exact-row dashboard cleanup proposal for the operator's separate review and final confirmation. This approval does not authorize admin deletion, bulk/prefix removal, SQL, Storage purges or deletion of any existing content.
- PhaseA selects/uploads no files and should create no Storage objects. Unexpected objects are a stop condition: record exact paths and request separate recovery review rather than adding Storage deletion to this approval. If existing dashboard access cannot demonstrate baseline/cleanup verification and an orphan-recovery route, execution remains blocked.

This approves only the method in principle. Its availability and exact row filters still need read-only verification before final go/no-go. The current scheduling and execution hold remains intact.

## Approval4 — narrowly scoped fault controls and stop behavior approved in principle

Approved by the user in principle, subject to verifying a suitable mechanism. No blocking rule or tool has been configured or validated. Scheduling, execution, Google sign-in and SQL work remain on hold.

- A1 may block only the identified owner profile overview GET, matching the actual method, endpoint and exact profile filter. Category creation POST, authentication and other operations remain allowed.
- A4 may block only DELETE of one recorded disposable draft ID, before transmission. Reads, inserts and every pre-existing draft remain unaffected.
- Use one tab-local rule at a time with operator attendance and a30second intended limit. Remove it before retry/cleanup. Automatic expiry is unverified; after interruption remove all test rules first, reconcile outstanding writes and stop new tests. Unknown write outcomes or a rule matching anything outside scope require an immediate stop, not retry.
- No global offline mode, host-wide blocking, Auth interception, response rewriting, production-code patch, new proxy/infrastructure or provider change. The current browser automation cannot supply these controls. A capable operator-controlled mechanism, exact matching and recovery procedure must be reviewed and verified before execution approval.
- If that cannot be established, leave A1/A4 unexecuted and seek review of a reduced plan; neither silence nor this approval authorizes a broader substitute or a full-PhaseA pass claim.

This approval covers these restrictions in principle only, not selecting/installing/enabling a tool, running a fault or releasing the scheduling/execution hold.

## Approval5 — window structure and interruption handling approved in principle

Approved by the user in principle only: a60minute PhaseA window, with new test actions stopping at minute35 and the remaining25minutes reserved for cleanup and reconciliation. Stop earlier on any existing stop condition. If cleanup is incomplete at minute60, stop new work and continue recovery until exact test-object outcomes and residue are reconciled; the timebox is not a guarantee of completion. After interruption, remove all fault rules first, reconcile outstanding writes and do not resume new tests without a fresh readiness check. No date/time is selected by this approval. Suitable fault controls, baseline/cleanup access, readiness evidence and final execution go/no-go remain separate prerequisites. PhaseB remains excluded.
## Pending step6 — evidence review before final execution approval

Do not request execution approval yet. First prepare a read-only readiness review: confirm the live release/source and exact owner identity, demonstrate existing baseline/cleanup inspection access without mutations, and assess a concrete method/filter-specific tab-local fault mechanism without enabling it. Report unresolved gates explicitly. If suitable fault controls remain unavailable, present a reduced PhaseA proposal for separate scope review instead of treating A1/A4 as passed. Exact run labels and the ledger must be reviewed before any later final go/no-go; no live objects are created in preparation. Scheduling and execution remain on hold until explicitly authorized.

## Reduced selection approved in principle — execution held

See [reduced A2/A3 plan](reduced-phase-a-a2-a3-plan.md). It proposes only A2/A3, maximum2portals/2drafts and1unresolved draft, no fault controls or uploads. A1/A4 remain BLOCKED and PhaseB excluded. User approved the reduced selection and tighter limits in principle. Read-only exact-ID inspection/recovery review is next; final execution go/no-go remains separate. Parent case descriptions below are reference, not permission to execute excluded cases.

## Purpose and execution boundaries

Verify the details-first portal handoff, failed confirmation recovery, stale portal rejection, ordinary desktop draft lifecycle and cleanup. A separately selected second phase verifies file upload and one **private** project publication, including transport and pre-commit publication recovery. No public/citable test publication, sharing, messaging, notifications testing or third-party assets.

Operator: Avinaash Mangalmurti, using the existing owner account. Confirm the exact account/profile ID before execution; do not infer it from display name alone. Use an idle period with no concurrent publishing/editing in that account. No signup-maintenance window, signup shutdown, Statuspage creation, announcements or Google test window is needed for this proposal.

Proposed timebox: 60 minutes, with new test actions stopping at minute35 and the remaining25 reserved for cleanup/reconciliation. This is not a booking. An interruption or failed cleanup can extend recovery beyond60 minutes; do not declare cleanup complete to meet the timebox.

Use420x912 MOBILE and1280x900 WEB. A second same-account tab is used only for deleting an approved disposable empty portal. Viewport emulation does not establish physical-iPhone behavior.

Read-only readiness review: [16 October report](phase-a-readiness-review-2026-10-16.md). Release439 and owner baseline verified; A1/A4 fault controls remain blocked. Recommended next decision is reduced A2/A3 scope review, not execution approval.

## Readiness gates — complete before any live writes

1. Reconfirm live version/source and record any subsequent release. If behavior differs from439, rereview this plan first.
2. Confirm execution approval, operator availability for the whole window and cleanup, exact existing account/profile, and selected phases. Review final destructive UI confirmations against the object ledger at action time; do not treat plan approval as a blanket deletion authorization.
3. Record baseline portal/project/draft IDs and counts, not just the visible published-project count. Keep existing drafts out of scope. If the app cannot expose all draft IDs, arrange read-only inspection through the owner's existing Supabase dashboard/session. No service-role key, new access grant, direct SQL or new cleanup endpoint.
4. Confirm a way to inspect the exact created rows and Storage object paths after cleanup using existing owner/admin access. A vanished UI card or a404 image URL is insufficient proof that a row/object was deleted. If inspection or recovery access is unavailable, do not start write tests.
5. Confirm ordinary UI draft discard, project deletion and empty-portal deletion are available for these objects. Account deletion stays disabled. Never delete a portal containing existing projects or rely on cascade deletion to clean drafts/files.
6. Review the narrowly scoped fault-injection mechanism described below. The current browser automation does not expose request interception. An operator-controlled DevTools facility or separately reviewed equivalent is required; otherwise skip injected-failure scenarios and retain local test evidence. Do not improvise production proxies, change DNS/provider settings, patch live JavaScript or bypass RLS.
7. For PhaseB, confirm the deployed access-aware publish RPC already supports Private and that a private test artifact can be verified through existing access. If unavailable, stop PhaseB; do not apply held SQL or use legacy/public publication as a workaround.
8. Do not run with unsaved real work open in either test tab. Prepare the ledger and synthetic file locally only after execution is approved. No file or live object has been created for this proposal.

## Disposable inventory and evidence

Choose a unique run token at execution, for example `PLQA-<UTC timestamp>-<random suffix>`. Use it in every test portal, project title and description. Do not delete by prefix alone: ownership, exact recorded ID and creation during this run must all match.

| Object | Limit / purpose |
| --- | --- |
| `RUN-RECOVERY` portal | One new empty portal; reused for all non-stale cases. Newly created portal label may appear on a public portfolio, so use innocuous synthetic wording. The portal itself is not promised private. |
| `RUN-STALE` portal | One additional empty portal, deleted only during the stale-selection case. |
| Drafts | Maximum6 created over the whole run, maximum1 unresolved/active at a time. Normally5 or fewer. Record each ID as its creation response arrives; record failures with uncertain outcomes too. |
| Private project | PhaseB only, maximum1 committed project. Reuse its draft across pre-commit failures; do not create another to retry. |
| File | PhaseB only: one locally generated plain image, no personal information or metadata, maximum512KiB. No PDF/video processing, external embeds, licences or creator content. |
| Storage | Only the exact paths returned for that draft/file and any generated test-only cover derivatives. Limit input bytes to512KiB; record actual object count/size and pause if unanticipated media/worker outputs appear. |

Ledger columns: case, UTC start/end, owner/profile ID, portal ID, draft ID, committed project ID, exact bucket/path list, request operation/status, retry count, expected/actual result, cleanup status and unresolved reason. Record the returned ID rather than guessing from title or URL. Initial draft rows may have empty titles: correlate them by the creation response ID, profile and portal.

Capture screenshots plus sanitized request operation/status/ID evidence. Do not export HAR files, bearer tokens, cookies, signed media URLs, credentials or full request headers. Keep raw IDs/paths in ignored local run evidence, not public support messages or committed documentation. Normal views can affect reading aggregates, caches or processing side effects; restoring visible counts is not a promise to erase all telemetry. Avoid navigating into the test reader unnecessarily.

## Fault injection and retry discipline

Use one tab-local rule at a time, target the exact observed operation, cap each simulated outage at30 seconds, then remove the rule before retry or cleanup. Document the match before enabling it and verify what was actually blocked. No global offline mode, whole-host blocking, Auth endpoint interference, malformed successful responses or delayed/lost-success responses.

- **Confirmation read:** target only the profile overview SELECT `GET /rest/v1/profiles` with the exact owner `id=eq.<profileId>` filter. Match the observed request, including method and filter; do not accidentally match account-ID lookups. Other overview SELECTs may follow, but no write should be blocked by this rule. The category creation POST must remain allowed.
- **Empty-draft cleanup:** block only DELETE of the exact test `project_drafts` ID. If the available tool cannot distinguish the delete from reads/inserts, do not run this injection.
- **Upload:** PhaseB only, abort the first request for the exact synthetic file destination before server acceptance. Do not simulate failure by losing an acknowledgement after a successful upload. Confirm the transport uses a distinguishable request before proceeding.
- **Pre-commit publish:** PhaseB only, prevent the exact test call to `publish_project_citation_fields` from being sent. Keep the uploaded objects tracked in the open draft. Do not emulate a timeout after a request may have committed. With a URL-only blocker, require that no other test tab or person is publishing and restrict it to the one browser tab; if that cannot be assured, skip this case.

A blocked write is safe to retry only when evidence shows it did not reach the server. If a write's outcome is unknown, stop: inspect the exact draft/project and objects before deciding whether retry is safe. No blind double-clicking, repeated Publish, alternate RPC or new draft to bypass a failure.

## PhaseA — portal handoff and disposable drafts; no uploads or publication

PhaseA cap:2 disposable portals and4 server drafts total, with at most1 unresolved draft. No replacement drafts beyond this cap without renewed review. Run sequentially. Complete cleanup verification after each created draft before advancing.

### A1. New portal, failed confirmation, retry without duplication (MOBILE)

- Open New project; enter `RUN A1` title and a synthetic description. Select Create new portal and name `RUN-RECOVERY`.
- Enable the reviewed confirmation-read blocker, then press Continue once. Record the category POST response ID. Expect one new portal, a visible confirmation/read error, retained title/description and selected created portal, no upload publisher and **no draft insert**.
- If the portal POST outcome is uncertain, stop and reconcile; do not press Continue again yet.
- Remove the blocker. Press Continue once. Expect the same portal confirmed by a new overview read, then one draft insert and one upload screen. Record its ID. Portal creation count must remain one; details must survive the handoff.
- Select no files. Close the publisher and verify the exact draft is gone. The current Close path invokes discard; it is not a promise to save for later. Retain the empty recovery portal for subsequent cases.

### A2. Stale portal cannot open uploads (MOBILE, two tabs)

- Create `RUN-STALE` through the normal portal UI and record its ID. Verify no projects/drafts belong to it.
- TabA: open setup, select this portal and enter synthetic title/description, but do not submit.
- TabB: verify the exact disposable empty portal ID and complete its normal delete confirmation. Never select an existing portal with a similar label.
- TabA: Continue once. Expect rejection either by current selection validation or by the fresh overview membership check. No draft/upload publisher may appear. Do not require a specific error string when the canonical category list has already refreshed.
- To prove recovery after rejection, choose the still-existing `RUN-RECOVERY` portal and Continue once. Expect one draft under that portal, never the deleted ID. Record it; close/discard and verify it is gone.

### A3. Desktop draft lifecycle (WEB)

- From the recovery portal's actual desktop entry, choose New project. The current WEB flow opens the publisher directly and creates a server draft on mount; details-first parity is not expected.
- Verify correct portal context and one draft ID. Do not select files. Close; verify deletion of that draft, no project and no Storage objects.

### A4. Failed discard retains a recoverable draft (MOBILE)

- Create one additional no-file draft in the recovery portal through setup and record its ID.
- Enable only the exact draft DELETE blocker. Close once. Expect a cleanup/discard error and the draft still tracked; the form must not falsely report successful discard. The current UI may show its discard confirmation rather than one fixed retry button.
- Remove the rule. Use its available discard retry/confirmation once; verify the same draft is deleted and the modal closes. If cleanup cannot complete, leave the tab open and stop the run; do not create another draft or proceed to uploads.

## PhaseB — optional private publication and transport recovery

**Separate execution selection required.** This is the only phase allowed to upload files or commit a project. PhaseA must have no unresolved residue before starting.

1. Create one draft in the recovery portal, record its ID and select the synthetic image. Before any Publish action, open Project details and explicitly set **Access: Private** (the current default is Public). On MOBILE details-first flow this may require Back/Edit project details. Confirm the field again immediately before publishing; do not rely on the review card, which does not display Access. If Private is missing or cannot be retained, stop and discard.
2. Upload recovery: enable the exact pre-send upload blocker and Publish once. Expect failed upload, retained title/description/image/order/cover and no committed project. Remove the upload blocker. Confirm no accepted object needs reconciliation. **Do not click Retry upload yet:** the current retryUpload callback automatically proceeds to publication after a successful upload. Install the next case's pre-send publish blocker first, or stop here and discard the draft if that next case cannot be safely prepared.
3. Pre-commit publication recovery: with no upload request in flight, enable the exact publish-RPC pre-send blocker, then click Retry upload once. The upload should succeed and retryUpload should then attempt publication, which must be blocked before transmission. This sequencing is based on the actual callback; do not race to enable a rule while bytes are already moving. Expect uploaded objects tracked, the same draft retained and no project. Record object paths. Remove the rule and use Retry publish once. Expect reuse of uploaded attachments, **no duplicate upload**, exactly one committed project and Private access. If the controls cannot guarantee this sequence, do not click Retry upload: discard the draft and mark this case skipped/local-only rather than broadening the blocker.
4. Verify the owner can resolve the exact private project ID and its persisted access value is Private through existing read-only inspection. Optional anonymous visibility check requires an independent signed-out browser context without signing out the owner's current session: load only the canonical project address and confirm no project content/metadata is exposed. If independent context is unavailable, mark external privacy verification incomplete rather than changing account state.
5. If there is an error after a project may have committed, **do not discard its files**. Use recorded ID/owner lookup to determine whether it exists. The current flow tracks committed publication separately and may offer Finish saving details. Resume only that same committed project if appropriate; do not start another. Unknown outcome is a stop condition.
6. Delete the exact disposable private project through the existing project UI, after checking the run ledger and final destructive confirmation. Confirm the project's media/cover cleanup result as well as row deletion. No announcement, share link, comment or bookmark is needed to prove publication.

Public exposure is not an accepted fallback. If the access-aware RPC is unavailable, keep/discard the draft and report a blocker; never apply SQL or change provider settings to make the test pass.

## Cleanup and interruption recovery

1. Disable every fault rule first. Stop new submissions and wait for in-flight operations to settle. If bytes are moving, use Cancel upload and wait for cancellation; do not close the tab mid-upload or rely on a reload.
2. Reconcile the ledger with existing read-only owner/admin inspection. Unknown insert/publish outcomes must be resolved before deleting related objects. Preserve open tabs until IDs and paths are recorded. Current ordinary flow uses `persist:false`; reopening after a crash is not guaranteed to restore its in-memory file/cleanup state.
3. For uncommitted drafts, use app discard: uploaded-object cleanup precedes draft deletion. Verify the exact draft row and object paths are absent. If cleanup reports failure, leave it visible and retry only after the fault is removed. Never delete the draft first and lose the only object inventory.
4. For a committed test project, use project deletion, not draft discard. Current service removes cover artifacts, deletes the project row, then attempts remaining stored media removal. A project can disappear while `storageDeleted` is false: record residual paths and treat cleanup as incomplete. Verify the original draft was consumed/removed; do not assume publication did it.
5. Remove `RUN-RECOVERY` only after every associated test draft/project and file has been verified gone. Verify `RUN-STALE` is already absent. Do not use portal cascade deletion to conceal an unresolved draft.
6. If normal UI cannot clean an orphan, stop and prepare an exact-ID/path cleanup proposal using existing owner/admin tools for separate review and action-time confirmations. No bulk SQL, prefix deletes, bucket purge, service-role scripts, migration or account deletion. Keep the test marked incomplete until residue is resolved.
7. Reconcile against the baseline IDs: no pre-existing projects, portals, drafts, objects, visibility/order, profile fields or settings should have changed. Restore temporary viewport and navigation. Remove only run-owned local synthetic files/evidence according to the agreed retention; do not purge shared browser Storage or caches.
8. On operator interruption, resume with inventory/reconciliation, not replaying creation/publication steps. If safe recovery cannot finish in the reserved time, communicate exact unresolved IDs privately and keep execution stopped. No automatic cleanup job or follow-up schedule is created.

## Stop conditions and acceptance record

Stop new work on: wrong account/portal, any non-test mutation, an unexpected public/citable publication, unknown write outcome, more than one unresolved draft, duplicates, auth/session problems, missing access-aware RPC, unavailable cleanup evidence, inability to target a fault narrowly, cleanup failure or reaching the creation cutoff. Remove blockers before recovery; do not relax permissions or modify production configuration.

Mark each case PASS, FAIL, SKIPPED or BLOCKED with evidence. A passing result requires correct current-portal ownership, no duplicate portal/draft/project, preserved intended form state, working retry, verified cleanup and unchanged pre-existing IDs. A skipped injection, unverified private access or unresolved Storage artifact is not an overall pass. Report tested platform/viewport and physical-device limits separately.

At review, select PhaseA only or PhaseA+PhaseB, confirm account/operator, inventory limits, exact deletion confirmations and the fault-control/inspection method. No execution, scheduling or cleanup approval has been requested or inferred by preparing this document.

## Source anchors used in preparing this proposal

- `src/App.tsx`: fresh profile confirmation and current-membership publisher guard.
- `src/features/publishing/ProjectSetupScreen.tsx`: retained selection/form, no duplicate creation on confirmation retry, unmount guard.
- `src/features/publishing/usePublishProject.ts`: automatic createDraft, update/upload/publish ordering, committed-result guard, discard cleanup.
- `src/features/publishing/PublishProjectDialog.tsx`: Close invokes discard; in-flight upload close prevention.
- `src/features/publishing/MobilePublishFlow.tsx` and `src/features/citations/ProjectCitationFields.tsx`: Back/Edit details, Private selection, review and retry surfaces.
- `src/services/supabase/contentReaders.ts`: overview profile SELECT and membership reads.
- `src/services/supabase/contentServices.ts`: draft insert/delete, access-aware publish, empty-portal deletion, project/media cleanup.
- [Bounded live439 check](live-439-verification-2026-10-16.md) and [local test report](redundancy-fixes-2026-10-16.md).
