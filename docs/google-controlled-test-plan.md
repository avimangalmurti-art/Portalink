# Controlled Google sign-in test and signup-maintenance plan — review only

Status: unscheduled proposal; no provider, SQL, job, secret, notice or deployment action authorized or performed. Existing Supabase project only. The [Cron proposal](google-cron-enablement-proposal.md), [activation checklist](google-signin-activation-checklist.md) and [preflight](google-signin-preflight-2026-10-15.md) are prerequisites, not execution approval.

## Scope, impact and fixed end state

Propose a **90-minute signup-maintenance window**, date/start time TBD in America/Los_Angeles, staffed throughout. Existing users' sign-in and ordinary content access should continue, but must be checked; new email-account creation will be rejected while the shared Before User Created hook is in testing/paused mode. New profile completion and email-confirmation attempts for incomplete accounts may be affected. A private preview does NOT isolate the shared backend. Public Google sign-in will remain closed.

The planned end state is **pre-test email signup behavior restored, Google disabled, private preview closed, no configured Auth hook**, with installation objects, test accounts, receipts and private test content retained. No public adult-launch activation occurs at the end of a successful test. Restoring this baseline means the old live app remains under its previous signup policy; it is not a claim that the adult-launch safeguards are publicly active.

Operator: Avinaash Mangalmurti. Backup/recovery operator and exact start/end times: TBD. Do not book the window until owner staffing, recovery authorization and all gates below are resolved. Ninety minutes is a proposed budget, not a promised outage ceiling: failed recovery requires an incident update and continued safe closure, never bypassing protections to meet a clock.

Concrete preview proposal: [address, callback, access, secrets and logging](google-private-preview-proposal.md). Its hostname is proposed/unreserved and its hosting/logging gates are unresolved; do not treat the address as a deployed endpoint.

## Go/no-go before booking

- Capture/recheck the live schema, exact source/build and SQL hashes, original function bodies/ACLs, provider/hook settings and recoverable checkpoint. Confirm no public activation ever occurred and the public-guard latch/final-public-legal flag remain false.
- Separately approve dormant SQL installation, Cron enablement/job and scheduler proof. No setup, troubleshooting, dependency installation or first credential creation belongs inside the timed window.
- Confirm a company-owned Google client, owner-entered credentials and exact preview HTTPS origin/first-party callback. Keep secrets outside source, logs and notices. Keep nonce checking on. Verify independently authenticated Google subjects through an approved enrollment mechanism; do not bootstrap by disabling the allowlist or trusting a decoded-but-unverified token.
- Provide a genuinely access-controlled private preview, tested from an unauthorized browser. Credentials/tokens and callback requests must not leak through logging, errors or caching. Review how callback access works through that access control. Its preparation/deployment requires separate approval; the existing public build stays intact.
- Owner approves test agreement versions/fixtures only; final public legal flag and public stage remain false. Separately approve the temporary shared hook/provider changes, data creation by the listed tests, and the exact initial-test exit transaction and configuration restoration. Never use real non-test accounts for fixtures.
- Local restoration tests must pass. Review `supabase/pending/google_initial_test_exit.sql`: it requires the database owner, paused state and operator acknowledgment; refuses a public guard/final-legal flag; clears unfinished handoffs and returns ONLY this never-public pilot to dormant configuration, preserving accounts/receipts/content. It does not verify external provider/preview state or remove the Auth hook automatically. Its use is a separate explicit reverse-migration approval, not a general exception to stage protections.
- Prepare an approved maintenance notice and support contact, and choose how existing signup entry points display it. Notification/UI changes and sending messages require separate authorization; none are performed here. If notice coverage cannot be provided without an unapproved release, postpone. Do not expose a broken sign-up form without an agreed communication plan.
- Rehearse provider disablement, preview closure, SQL restoration and hook-baseline restoration from independent owner access. Ensure the operator can recover even if the private preview is down. If any prerequisite or backup is missing, NO GO.

Draft notice for later approval: “New account registration will be temporarily unavailable from [start] to [end, time zone] while we test sign-in. Existing sign-in should remain available. Updates: [approved channel]. Support: avi@portalinknetworks.com.” No notice has been sent or published.

## Approved test identities and data

| Fixture | Purpose |
| --- | --- |
| G1: owner-controlled adult Google identity with no Supabase account | New account, then returning login; verified subject allowlisted |
| G2: separate owner-controlled confirmed EMAIL test account with matching Google email | Same-email linking/return-path behavior; verified Google subject allowlisted; confirm exact account ID preserved |
| G3: owner-controlled adult Google identity not on allowlist | Rejection without Supabase account creation |
| E1: dedicated email signup and incomplete-confirmation fixture | Expected rejection during testing and recovery verification afterward |

Enrollment, account creation, linking and synthetic content writes require explicit future test authorization. This document creates none. Use synthetic screening data and clearly private test projects; do not use minors or real users' work. Store account IDs/Google subjects only in protected operational notes; never tokens, raw DOB, passwords, codes or signed URLs. No messages to users or deletion of accounts/content are part of the tests. Additional fresh identities are needed for repeated first-account tests; do not delete/recreate accounts to reset fixtures.

## Relative window: no calendar event scheduled

| Time | Planned action and checkpoint |
| --- | --- |
| T−24h to T−15m | Approved notices and preflight; all prerequisites and restoration path ready; repeat critical state checks |
| T+0–10m | Begin announced maintenance; enter testing with allowlist; configure the approved hook and Google provider; verify non-test/email rejection before admitting G1 |
| T+10–35m | New/returning and same-email cases; account/receipt checks; core negative cases. Start the expiry fixture early enough to observe its ten-minute expiry naturally |
| T+35–50m | Verify scheduled expiry cleanup without manual cleanup/new-start contamination; replay/cancel/race cases; desktop regression checks |
| T+50–60m | Mobile critical path on 420×912 preview plus an actual phone where available; keyboard/redirect/back behavior. Record any physical-device gap as incomplete acceptance |
| **T+60m hard stop for new tests** | Begin planned exit even if all tests have passed. Never convert the test into public activation |
| T+60–80m | Pause, disable Google, close preview, execute separately approved initial-test restoration, restore hook baseline and verify old email signup behavior |
| T+80–90m | Confirm recovered state, cleanup/job health and existing sign-in; issue approved closure update and save redacted results |

If setup exceeds ten minutes, a critical case fails, or remaining time cannot cover recovery, stop testing early. Do not extend the window silently; any extension needs a new owner decision and approved notice. A single operator performs configuration/SQL actions serially; observers do not run concurrent writes.

## Test matrix and pass criteria

| Case | Required observation |
| --- | --- |
| Private preview access | Unauthorized browser cannot enter; callback works for approved tester without weakening access control |
| G1 new account | US/18+ admission and separate agreement acknowledgment precede Google; exactly one account/Google identity; receipt versions/time/account correct; profile/project private |
| G1 return login | Same account ID; no duplicate receipt for same versions; stable existing content |
| G2 same-email | Account preserved, no surprise duplicate/privilege change; unexpected linking behavior is a STOP requiring review |
| G3 and E1 | Unlisted Google cannot create a Supabase account; new email rejected during testing; no fabricated receipt |
| Direct/forged requests | Unadmitted Google creation, editable-metadata forgery, wrong browser/state and unsafe return path denied; never widen the allowlist to make a test pass |
| US/age/date/agreement negatives | Non-US, under-18, invalid/future date, missing/stale acknowledgment denied before account creation; no persistent DOB |
| Cancel/expiry/retry | Cancellation yields generic error; ten-minute expired ticket rejected; new attempt can recover without deleting users |
| Replay/two tabs | Reuse denied; duplicate callback cannot cancel the valid in-flight attempt; only correct browser completes |
| Identity validation | Signature/audience/issuer/nonce negative coverage remains passing locally; hosted boundary verifies actual subject/provider contract. Do not forge live Google tokens or probe unrelated accounts |
| Version change/pause | Old handoff denied after approved controlled version change or pause; no receipt fabrication; reset only through approved owner operations |
| Session/return path | Tokens absent from URL/referrer/log evidence; SDK installs session; expected safe return path; no open redirect or callback caching |
| Cron expiry | Three scheduled successes; valid pending ticket survives; expired/stalled fixture removed by scheduled run with accounts/receipts intact |
| Existing app | Dedicated existing-account sign-in/recovery and representative content views work; no unintended non-test writes |
| Recovery | Email fixture signup/profile completion works again under baseline; Google off, preview closed, hook baseline restored, launch capability false, test/private data retained |

Record each as PASS/FAIL/NOT RUN with timestamp, platform, source/SQL hashes and redacted evidence. Do not mark live Auth, Cron, physical-device or same-email behavior passed from local mocks. Unperformed or failed cases block a later readiness claim; passing cases do not authorize publication.

## Stop conditions and incident response

Stop new attempts immediately for: unlisted account creation; wrong-account linking/receipt; exposed token/DOB/secret; public preview access; unintended data changes; existing-user login regression; cleanup error/missed target or last scheduled success >3 minutes; or inability to reserve 30 minutes for exit. Pause admission first, preserve only redacted evidence, and notify the owner via the agreed channel (no communication is authorized now). Do not globally sign out users, delete accounts, drop tables/extensions, change unrelated settings or bypass a public latch.

## Planned initial-window exit: explicit reverse migration

1. Under previously approved window/recovery authority, call the stage function for paused mode. This closes new handoffs, rejects new signup through the hook, wipes unfinished protocol data and resets hook/OAuth verification flags. Confirm paused and capability false. Existing sessions remain; this is not a token-revocation procedure.
2. Disable Google in the existing Supabase provider and close private-preview access, using approved owner access. Preserve secrets securely; do not copy credentials into an incident note. Independently verify both conditions. Never restore the initial stage while Google is still enabled.
3. Confirm the project has NEVER entered public activation and both public-guard/final-legal flags are false. Review baseline and exact reverse SQL hash. Only an approved owner may supply the documented same-session initial-exit acknowledgment and apply `google_initial_test_exit.sql`; it refuses missing acknowledgment, non-paused state and public-launch flags. This is explicitly separate from `set_adult_launch_stage`, which continues to refuse returning to installed.
4. While the temporary hook is still attached, verify dormant stage, unapproved/null candidate versions, Google capability false and no unfinished handoffs. The dormant hook now passes through baseline signup and database guards are dormant. Then restore the captured Auth-hook baseline (no hook) via its separately approved setting action. This order avoids reopening email signup while paused profile guards still reject completion.
5. Verify E1 email signup/confirmation/profile completion and dedicated existing-user sign-in against the old live app. Preserve the resulting account/private test work. No user deletion is authorized. Keep Google disabled and do not publish the candidate build.
6. Continue cleanup until protocol retention is safe; Cron/job objects may stay installed and idle. Only separately approve unscheduling its exact job ID, never dropping the extension or affecting unrelated jobs. Save the end-state receipt and approved maintenance closure notice.

If step 2 or 3 cannot be verified, DO NOT run the reverse transaction. Remain paused, keep the signup-maintenance notice active, escalate promptly and obtain an approved repair/extension plan. The window is not recovered until the end-state checks pass. If public guards were ever activated, this initial-test exit is forbidden: retain them, use the public pause/re-test procedure, and review any further rollback separately. Never clear the latch to force restoration.

## Review decision and remaining gaps

Review the 90-minute budget, owner/backup, notice channels, fixture/enrollment mechanism and all separately authorized actions, including the explicit initial-test reverse transaction. Date, final credentials/client, preview access control, hosted Cron proof and recovery checkpoint are still pending. This is a plan and locally tested SQL candidate, not a booked window, deployed monitor, published notice, enabled provider or public-launch approval.

Local review evidence: 36 focused tests passed, including eight disposable PGlite database tests; no failures or skips. The initial-test reverse transaction is exercised only locally, including owner/acknowledgment/pause requirements, preservation of accounts/receipts/private content, and refusal after public activation. Actual provider restoration, Cron execution and maintenance timing remain untested. Exact candidate hashes: [review manifest](google-operations-review-manifest.json).
