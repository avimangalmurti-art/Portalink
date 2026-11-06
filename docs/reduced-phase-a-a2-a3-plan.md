# Reduced Phase A — A2/A3 only

Prepared 16 October 2026 for review. NOT SCHEDULED OR AUTHORIZED FOR EXECUTION. Target: https://portalinknetworks.com, existing Portalite owner account and existing Supabase project. Reference: [parent plan](controlled-live-publishing-test-plan.md) and [read-only readiness review](phase-a-readiness-review-2026-10-16.md). Parent approvals1–5 remain in principle. The user has also approved this reduced A2/A3 selection and tighter2portal/2draft/max1unresolved limits in principle; scheduling and execution remain held. No fault controls are needed or permitted in this reduced run.

## Scope and limits

- A2: MOBILE stale empty-portal selection rejection and recovery, using two same-account tabs at420×912 CSS pixels.
- A3: WEB ordinary draft creation and discard at1280×900 CSS pixels. Preserve the existing desktop entry flow.
- A1 and A4 remain BLOCKED, unexecuted, and outside acceptance. PhaseB is excluded. No assertion of full PhaseA or fault-recovery acceptance.
- Up to2 disposable portals: a recovery portal and a stale-selection portal. Benign labels may briefly appear on the public portfolio.
- Up to2 server drafts total (one successful A2 recovery draft and one A3 draft), maximum1 unresolved at a time. This tightens the parent4-draft ceiling. No replacement draft after an uncertain outcome, failure or unexpected extra insert without renewed review.
- No file selection, uploads, committed projects, sharing, messaging, settings, Auth/provider changes, SQL, Google sign-in work or deployment. Existing projects/portals/drafts excluded from mutation. No fault interception, global offline mode or simulated network failure.
- Retain the approved-in-principle60minute structure: new work stops at minute35;25minutes reserved for cleanup/reconciliation. Recovery can extend beyond60minutes. No date/time selected.

## Cleanup-readiness evidence

[Read-only walkthrough](a2-a3-cleanup-readiness-2026-10-16.md) demonstrates exact portal-ID match and exact-ID no-match results in portals/drafts. Recovery procedure reviewed against source; no destructive capability/live recovery claim. Next review is acceptance of the procedure in principle, with separate exact-ID administrative confirmation if normal app recovery fails. All execution holds remain.

## Gates before final go/no-go

1. Demonstrate exact-ID lookup and absence verification through existing Supabase Table Editor using read-only filters; do not mutate an existing row to prove deletion privileges. Review an actionable exceptional orphan-recovery path without executing it. Any actual administrative deletion requires separate exact-ID review and action-time confirmation.
2. Refresh release/source and exact owner/account mapping privately. Version439/source1a51771aa2f79f0bf493abc80c11c2535457272a was confirmed at the prior review; rereview changed behavior before testing another release.
3. Refresh complete owner portal/project/draft baseline IDs and counts. Prior snapshot8portals/16projects/0drafts is evidence only, not the execution baseline. Do not store credentials/session tokens, HARs or signed URLs.
4. Confirm operator attendance and no concurrent owner edits/publishing. Use only two deliberate same-account tabs, with no unsaved real work. Record which tab and viewport serve each case.
5. Review exact innocuous run labels and ledger immediately before final approval. Suggested pattern PLQA-<UTC timestamp>-<random suffix>-RECOVERY or -STALE. No token or live object reserved by this document.
6. Obtain explicit execution approval for this reduced scope after all evidence is complete. Scheduling approval and execution authorization are not implied by scope approval. Do not start writes if inspection/recovery capability remains uncertain.

## Future run sequence — not to be executed now

### Preparation within an authorized run

Create the recovery and stale portals through the normal portal UI, recording each returned ID and owner/profile before continuing. Verify both are empty and absent from the original baseline. A label alone never authorizes deletion. If a creation outcome is unknown, stop and reconcile rather than repeating it.

### A2 — stale selection and recovery

1. MOBILE TabA: open new-project setup, select the stale portal and enter synthetic title/description. Do not Continue yet. No draft should exist at this step.
2. TabB: verify the exact run-owned stale portal ID is empty of projects and drafts. Review and complete its normal deletion confirmation only under the future execution authorization and applicable action-time confirmation requirements. Do not rely on cascade deletion.
3. TabA: Continue once. Expect rejection through current selection validation or fresh overview membership checking; do not require one fixed error string if the category list refreshed. No draft or upload publisher may appear for the removed portal. Verify absence of an unexpected draft in the dashboard.
4. Select the recorded recovery portal; Continue once. Expect exactly1 draft belonging to that portal, never the deleted ID. Record its ID before closing. Select no files.
5. Close/discard using the app. Verify that exact draft is absent and no project/Storage object was created. Finish cleanup verification before A3. If rejection, draft creation or cleanup differs from expectations, stop; no fault injection or extra draft to work around it.

### A3 — desktop lifecycle

1. WEB: use the recovery portal's actual New project entry. The desktop publisher creates a draft on mount; do not demand mobile details-first behavior.
2. Record the one returned draft ID and verify its recovery-portal/profile context. Select no files.
3. Close/discard normally. Verify that exact draft is gone and that no project or Storage objects were created. Do not create another draft to test retry.

### Final cleanup and verification

After both draft IDs are verified absent, delete only the exact run-owned empty recovery portal with its final confirmation. Verify both test portals and both draft IDs are absent; compare pre-existing owner portal/project/draft IDs against baseline. Unrelated users' rows are not the test target. A disappearing UI card is not sufficient deletion evidence.

If interrupted, stop new actions and wait for outstanding writes to settle. No fault rules should exist in this plan; if any are unexpectedly present, stop and remove them before recovery. Reconcile any late-created draft by returned/exact recorded ID before retrying or closing. Ordinary draft state is not guaranteed to survive reload. Prefer normal app cleanup. If an orphan cannot be reached, preserve evidence and seek separate exact-ID administrative recovery approval. Never delete by label/prefix, use bulk SQL, delete an account or broaden permissions. Unexpected files, unknown outcomes, duplicates or more than1 unresolved draft stop the run. Do not declare recovery complete to meet the timebox.

## Acceptance and next approval

Record A2/A3 separately as PASS, FAIL, BLOCKED or NOT RUN with evidence, exact-ID cleanup and baseline comparison. Report emulated viewports and physical-phone limits. A1/A4 remain BLOCKED; PhaseB NOT SELECTED. This plan cannot establish confirmation-outage or failed-discard recovery, upload reliability or private-publication behavior.

Reduced scope and tighter limits are approved in principle. Next review: demonstrate read-only exact-ID lookup for a known baseline portal/project, verify an absent ID returns no matching row, and document how a future recorded orphan draft would be located and safely proposed for recovery. Use existing Table Editor access only; do not insert/delete/edit rows, run SQL, create test objects or change settings. Show the recovery route without submitting a destructive action. A random absent ID is only a filter demonstration, not evidence of successful deletion. Destructive capability remains untested and any exceptional administrative deletion requires separate exact-ID review and action-time confirmation. Present results and remaining blockers before requesting final execution go/no-go. All scheduling/execution/Google/SQL holds remain until explicitly changed.
