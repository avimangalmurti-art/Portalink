# Google sign-in read-only preflight — 15 October 2026

Checked around 23:25 UTC (16:25 Pacific) against the existing Portalink Networks Supabase project, production main branch. Four SELECT-only catalog queries and read-only Google provider/Auth hook dashboard inspection. No account/content records, credentials, settings, migrations, extensions, jobs, legal pages or deployments were changed. No snippet was saved. This snapshot does not authorize installation or activation.

## Findings against the activation checklist

| Area | Current evidence | Assessment |
| --- | --- | --- |
| Existing backend | Correct Portalink project; PostgreSQL 17.6 | Retained; no new backend |
| Candidate tables/functions/indexes | No adult-launch or handoff objects found | Installation candidates remain absent; no name collision found |
| Required columns | Profile/account IDs and project/profile IDs are UUID; privacy and citation fields Boolean; Auth confirmation timestamp, JSON metadata and Google provider/subject columns exist | Required structural assumptions match |
| Defaults | Profile privacy, project hidden and citation permission all default false | Matches dormant-install preservation; future activated triggers enforce privacy |
| Existing functions | Expected signatures, parameter names, return types and postgres ownership; anon/authenticated/service-role execute ACLs inspected | Compatible with proposed wrappers, subject to final recheck |
| Function dependencies | Citable-page policy and citable-images view depend on is_project_citable | Preserving original function OID is required, as candidate now does |
| Triggers | Nine existing profile triggers and eight project triggers inspected; no candidate trigger names present | No naming collision; hosted interactions are not exercised by this read-only preflight |
| Default privileges | New public tables/functions inherit broad grants to anon/authenticated/service_role | Candidate explicit revokes/RLS are essential; do not remove them |
| Migration ledger | supabase_migrations.schema_migrations is absent | Cannot establish migration history from a ledger; inspect objects and use existing reviewed deployment records. Do not repair history or apply all migrations |
| Google provider | Disabled; client ID and secret fields empty; skip-nonce false; users-without-email false | Provider intentionally unconfigured; nonce protection retained |
| Existing Auth | Email enabled, confirmation enabled, new signups enabled; manual linking/anonymous sign-in disabled; Apple disabled | Preserve existing settings until separately authorized |
| Auth hooks | Empty hook list | Before User Created not configured; no hosted hook-contract proof |
| Cron package | pg_cron 1.6.4 available; installed version null; cron.job absent | Supported package exists, but cleanup cannot run yet |
| Cron runtime metadata | cron.database_name=postgres; cron.use_background_workers=off | Observed configuration only; background-workers off is not by itself a failure |

Machine-readable metadata, baseline definition hashes and exact candidate SQL SHA256 values: [preflight snapshot](google-signin-preflight-2026-10-15.json). The original function definitions were inspected through pg_get_functiondef; this metadata/hash record is not a full recovery backup. Capture exact approved recovery definitions/ACLs immediately before any later installation and repeat collision checks if the database changes.

## Installation and activation conclusions

The checked schema prerequisites match and no candidate collision was found. This is a structural preflight, not approval to install or proof that the transactions succeed against every live trigger and policy. Keep both installation migrations and the separate cleanup schedule unapplied until separately reviewed/authorized.

Cron is the concrete missing operational prerequisite. The scheduling candidate intentionally requires an existing pg_cron extension and will refuse the current state. A separate extension-enablement proposal or an alternative scheduler must be reviewed and authorized before any job installation. No extension or job was enabled here. Subsequent hosted job execution and expiry cleanup still need proof before cleanup_verified can be set.

Controlled testing also has a production impact: this project currently accepts email signups and has no hook. The candidate hook in testing rejects email creation project-wide, even if the new frontend is a private preview. A private preview does not isolate Auth behavior on the shared backend. Agree a controlled signup-maintenance window and recovery plan before configuring that hook, or separately review a revised testing policy. Do not silently treat a private preview as isolation for existing signups.

Google is disabled with empty Supabase credentials. This does not prove whether a client exists in Google Cloud. Before testing, inspect/confirm the company-owned client and exact first-party callback, with credential entry left to the owner and separate configuration approval. The standard Supabase callback displayed in its provider form is not proof that the new first-party callback has been authorized in Google Cloud.

## Recommended next step

Prepare a review-only operational proposal for (1) enabling the available pg_cron package and scheduling/monitoring cleanup, and (2) a controlled test window accounting for the shared Auth hook's effect on existing email signups. Continue final legal-copy review and company-client verification in parallel. Do not enable Google, configure hooks, set stage/verification flags, apply SQL or publish yet.

Remaining unverified gates: final legal text/versions and public pages; Google Cloud client/consent/callback settings; full installation recovery checkpoint; hosted hook payload and rejection behavior; test-subject enrollment; worker server-secret provisioning, sensitive-request logging and rate limits; access-controlled preview; real new/returning OAuth flows and physical-phone acceptance; actual scheduler execution/monitoring and physical deletion reliability; incomplete email-account completion and scoped unused-session handling.
