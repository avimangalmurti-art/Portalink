# Streamlined signup — review only

On `codex/streamlined-signup`, created from fetched `github/main` and retaining
Terms PR44 (`9c73b3e`). Draft review is stacked on `codex/terms-sheet` so its diff
contains only this task. References PR45 and Journey Insights PR46 are separate.
No merge, SQL, Auth configuration, deployment or publication is authorized or
performed. Existing Supabase, accounts, Storage, Sites worker and D1 remain.

## Flow

Hello World keeps its existing media, positioning and button/link styling. The
choices are Continue with Google, Continue with Apple, Continue with email,
Sign in and Continue as guest. Password recovery remains on Sign in. Provider
errors keep the welcome visible and offer the existing email route.

Email uses one form: Email, revealable Password and Name, then Create account.
There is no confirm password, photo, city, visibility picker or local signup
restore. The name-derived address is shown once under Name, with change revealing
a handle field. An available address is kept exactly; only an actual taken result
or database handle-unique collision permits a suffix. Other availability failures
fail closed. Identity input stays in account metadata across email confirmation,
not an IndexedDB form/photo draft. Passwords are never included in that metadata.
Legacy draft helpers remain for compatibility checks but the signup/session and
first-sign-in paths do not read/restore them or require local draft storage.
Photo and city remain in the untouched profile editor.

New verified accounts using any method go through Make it yours, then Terms,
then Add your first project / Skip for now. The phone Appearance component and
its existing layout/CSS are unchanged; its original appearance-step selector is
retained, with live preview, system grey, accent colour, high contrast and reduce
translucency. Desktop retains its existing account frame and hosts those same
controls with a scoped style; no other page gets new styling.

An account metadata setup preference (`portalink_onboarding_step`) persists the
sequence across reloads/devices. It is never ownership/authorization evidence.
Canonical profile ownership still comes from the existing RLS-protected row.
Returning creators with an existing profile and no setup marker keep their current
flow. Password recovery never starts onboarding. Appearance completion is saved
before Terms can mount. The Terms feature continues to check effective agreement
versions and blocks the app when review/writes fail. Existing legacy staged consent
can complete a previous pending signup; this form never stages new consent early.
Disagree signs out the local session, returns to welcome, and does not delete the
account. Profile creation occurs only after Terms releases the app, reconciles an
existing/uncertain insert, preserves the selected appearance and name/handle, and
never uploads an automatic provider photo. Its failures expose retry.

Add opens the existing publishing flow; Skip persists completion and navigates to
Explore (`/portalink`). Neither automatically publishes work or restores a signup
draft. An interrupted first-project choice reappears until explicitly completed.

## Activation limits

Public read-only Supabase settings inspection confirmed **Google disabled, Apple
disabled, email enabled** on October12. SDK calls use the existing project and root
OAuth callback. Enable/configure each provider with its own OAuth client in the
existing Supabase Authentication provider settings before live sign-in can work;
provider secrets never belong in client code or `VITE_*`. No provider settings,
redirect allowlist or credentials were changed, and no real Google/Apple account
was created or connected during verification.

The Terms PR44 Supabase migration and D1 email reservation migration remain
unapplied, and legal documents remain counsel-review drafts. They still require
separate review/approval. Do not apply unrelated migrations or publish this signup
source before its dependency is reviewed and activated. No new SQL is added by
this task. Retarget this stacked draft to main after approved PR44 integration.

## Verification

Focused tests exercise the real signup hook/form without draft storage, validation,
provider callback and metadata mapping, first-sign-in stages, failed preference
writes, exact/colliding handles, canonical profile reconciliation, Terms order and
version bumps, Disagree local sign-out, Add/Skip completion and Explore callback.
The actual app is exercised with synthetic services in an ignored QA entry, with
screenshots in `docs/evidence/signup-20261012`; no production account/acceptance
writes. Browser preview is not physical-iPhone or real OAuth-provider proof.
All1,685 Node tests pass (0 failures/skips), typecheck and client/worker builds
including main/visitor configuration guards pass, and lint has0 errors/111
warnings. Mobile420, supplementary390 and desktop1280 were checked without
horizontal overflow/new console errors. Both Skip-to-Explore and Add-to-publisher
were verified. Preview stopped, browser tab closed, viewport/local test appearance
preferences restored. Final receipts are in the handoff.
