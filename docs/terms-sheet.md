# Terms sheet — review and activation

This task adds only the Terms sheet, its agreement readers, one Settings Terms row, and signed-out legal pages. The reference's three boards correspond to the top of the sheet, its scrolled state, and the Content Licence reader. Existing registration fields, onboarding, profile, Studio, Journey and visitor presentation retain their existing design.

## Consent and identity

The streamlined signup task supersedes the original pre-signup ordering below: new accounts first sign in/confirm, then Make it yours, then Terms, then the first-project prompt. Signup no longer stages new consent versions or restores browser drafts. Existing staged consent remains readable for prior pending accounts.

Submitting Create account opens the required reader before calling Supabase signup. Disagree makes no signup call and returns to welcome; an existing signed-in account is signed out locally before returning. No account is deleted. Agree carries the exact four versions in signup metadata. Where confirmation is required, acceptance rows are written on first confirmed sign-in before mounting profile/onboarding flows. The database records that authenticated insertion time, rather than claiming the initial unverified tap was an authenticated acceptance.

Existing accounts are checked at entry and on foreground/focus, with a one-minute foreground interval. An effective version bump blocks further app interaction until reviewed and accepted. Back, Escape and outside taps do not dismiss required consent. Rechecking the same versions does not redisplay the sheet. The read-only Settings sheet lists accepted versions and timestamps and has Done instead of Agree/Disagree.

## Pending deployment steps — require approval

Nothing in this task applies SQL, changes authentication settings, merges or publishes. Live remains Sites379. Review the four draft documents and the single Supabase migration `supabase/pending/legal_documents_and_acceptances.sql`. All four documents are version 1.0, effective 2026-10-12, and marked `[DRAFT — not yet reviewed by counsel]`. Replace drafts with counsel-reviewed text before production activation. Regenerate the pending SQL using `node.exe scripts/prepare-legal-migration.mjs` after editing the initial draft sources.

After explicit approval, preflight the existing Supabase project and pgcrypto/`extensions.digest`; apply only this reviewed migration. Do not apply all pending migrations or repair migration history. RLS permits effective document reads and an account's own acceptance inserts/reads; update/delete are denied. The trigger checks the current effective version and stamps time, user agent and a per-record salted IP hash. Local PGlite tests use a test-only digest stand-in; they verify SQL ownership/version rules, not deployed pgcrypto behavior.

The independent D1 reservation table is in `drizzle-pending/0004_legal_email_rate_limit.sql`, outside automatic migrations. Applying it also requires approval. Retain the existing worker and D1 data. Publish the reviewed matching source only after approval and both database prerequisites, then verify public pages, confirmation-to-onboarding consent, Settings history and authenticated email delivery against the existing services. Until prerequisites exist, legal retrieval fails closed rather than creating fake acceptance.

## Resend runtime configuration

Set **`RESEND_API_KEY`** as an encrypted secret in the **existing Portalink Sites production worker runtime environment**, using Sites' native runtime-environment configuration for project `appgprj_6a9273ef43f8819198e0878a0020ad91`. Set **`RESEND_FROM`** there to the verified sender address, for example `Portalink <legal@your-verified-domain>`. Neither belongs in `VITE_*`, committed code or a client environment file. Preserve all other environment values. The exact connector operation is `sites_update_environment_variables`: set `RESEND_API_KEY` with `is_secret: true`, and set `RESEND_FROM` without removing existing entries. A saved-version deployment applies the resulting environment revision, so defer that deployment until approval. No credentials have been set by this task.

`POST /api/legal/send` authenticates the account through the existing worker path and uses the account's confirmed email; it ignores caller-supplied recipients. Missing API key, sender or D1 binding yields “Email not available yet” without sending. A shared atomic D1 reservation limits sends to one per account per rolling ten minutes; uncertain failures retain that reservation to avoid duplicate delivery. Resend calls have an idempotency key. The email contains a short note and four canonical links pinned to the selected version with effective dates. The sheet confirms that links were sent. **PDF attachment is a follow-up**, per the user's revised scope.

Supabase confirmation email SMTP is separate: the account owner configures Resend's SMTP credentials in Supabase Authentication → SMTP Settings. This endpoint does not change that configuration and cannot send to an unconfirmed account. Resend's testing sender is not a production sender for arbitrary recipients.

## Public and MCP licence consistency

Public `/legal/terms`, `/legal/privacy`, `/legal/content-licence`, `/legal/ai-access` render the same stored Markdown, version and effective date signed out. `?version=1.0` pins a historical agreement. The legacy `/licenses/view-only-v1` and `/licenses/citable-v1` return permanent redirects to the corresponding Public/Citable sections of Content Licence 1.0. Citation JSON-LD therefore resolves to the accepted text.

The existing MCP server is on separate unmerged PR6, not in this source baseline. `src/server/legal.ts` supplies a tested adapter returning the canonical Content Licence Markdown and version. `docs/legal/mcp-license-integration.patch` adapts PR6's two existing MCP call sites without enabling or importing that independent server. It was checked against that checkout with `git apply --check --unidiff-zero <patch>`. Apply/review it when integrating PR6; an active MCP server has not been tested or deployed here.

## Verification limits

See `docs/evidence/terms-20261012/README.md` for the three actual frontend screenshots and browser checks. Local services are simulated because the production migrations remain unapplied. Automated tests exercise real frontend hooks, SQL permissions in PGlite, HTTP routes and mocked Resend. They do not establish live delivery, physical-iPhone behavior, active MCP operation or production database activation.
