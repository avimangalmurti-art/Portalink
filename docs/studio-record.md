# Your record — draft review

This change adds the private Your record block above the existing mobile Studio Overview, one applicable post-publish step, the returning-user Home line, owner project tidy-up chip beneath its existing information title, and the first applicable owner actions-sheet row. Existing desktop Studio remains its development placeholder; it is not redesigned by this task.

There are **10 available steps**: school + city is deferred by the user, and Connect your AI is unavailable while MCP is not live. Neither counts toward completion. Name, handle and photo share a step; its link opens the first missing existing field. Completing data removes external prompts and marks the Studio step done. Tidy-ups disappear after their actual fix. There are no manual completion checkboxes.

## Private data and API

`supabase/pending/studio_record.sql` is review-only and **unapplied**. It requires the separately reviewed external references migration from PR45. It adds owner_events, server-stamped 14-day snoozes, permanent Never memory, confirmed preview/copy events and a private visit timestamp used to compute the three-day Home gate. No other step completion flags are stored.

The one owner-facing RPC is `studio_record_status(profile_id)`. Its ownership check precedes reads and returns SQL42501/HTTP403 for another account. The worker exposes GET/POST `/api/studio/record`, verifies the Supabase account and canonical profile ownership before accessing a five-minute owner cache, and uses the caller's bearer token for RPC and memory writes. Reopening or fixing data forces recomputation. Responses are private/no-store; account changes cancel or discard old responses.

The existing public profile bundle SQL, public domain schema and citation endpoint are unchanged and protected by snapshots. The visitor's complete compiled module set remains unchanged; no record feature module is reachable there. No notification, email, dock badge, public count, ranking, signup, Journey or Explore change is added.

Preview is recorded only after the actual same-origin public profile has loaded and is no longer hidden by the visitor welcome. Copy is recorded after the existing clipboard operation succeeds; QR/download/mail-launch events do not count as copied/shared links.

## Daily link observations — also review-only

No existing daily profile-link checker was present. The application SQL therefore includes a private `studio_record_link_checks` input table and a service-only due queue. Owners can read their own observations; only the worker service identity writes them. Status derives link tidy-ups from observed non-2xx results on currently stored HTTP profile links. Missing/unknown checks cannot produce a fabricated success or broken-link result.

Sites schedules launch agent tasks, so this product job uses the existing Supabase scheduler and a private worker HTTP endpoint instead. `POST /api/studio/record/check-links` refuses account tokens and fails closed without both server secrets. It drains bounded daily-due batches, validates public addresses and each redirect, forwards no account credentials to outside sites, limits each check to five seconds, and cancels response bodies. An execution time budget leaves remaining work for the next invocation.

**After approval only**, set `STUDIO_RECORD_CHECK_SERVICE_KEY` and `STUDIO_RECORD_CHECK_TOKEN` on the existing Sites worker's server runtime environment. The service key belongs to the existing Supabase project; the job token should be a separate random secret of at least32 characters. Never put either in code, logs, the client build, or VITE_* variables. Store the matching job token in the existing Supabase Vault under the name `studio_record_check_token`.

`supabase/pending/studio_record_link_schedule.sql` is a separate, **unapplied activation script**. It requires reviewed Cron/pg_net/Vault availability and the Vault secret; it enables no extension and creates no secret. It schedules one bounded invocation every five minutes, while each URL is due at most daily. Review capacity and monitor the queue on activation. The same worker, Supabase project, users and D1 data are retained. [Supabase Cron](https://supabase.com/docs/guides/cron) supports recurring HTTP jobs; the request uses [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

Do not apply either SQL file, set runtime secrets, activate the schedule, merge or publish without user approval. Deactivation should unschedule only this named job and disable its route/UI, preserving recorded memory and observations.

## Verification and limits

The full Node run passed1714 tests (zero failures/skips). The final23 focused checks and four disposable PGlite SQL checks also pass, covering fail-closed job authentication, schedule preflight, current-screen targets, preview redirects and final UI/navigation changes. Disposable PGlite checks exercise real ownership/RLS, server timestamps and derived date/summary fixes; no production schema or data was changed. Typecheck, lint and client/worker build pass; lint has112 warnings (111 baseline plus the new context's Fast Refresh export warning). Main and visitor Supabase configuration guards pass.

Screenshots are from actual app components at420×912 using explicitly synthetic services/transport: fresh and existing example-owner Overview, completed state, Home line, post-publish state, project chip and actions. They do not represent a production account or a real publication. The user's live-account status, applied migration behavior, hosted job execution, actual visitor-preview completion and physical iPhone behavior remain unverified until approved activation. Existing desktop project/Studio presentation is checked for preservation; mobile overflow checks also use390px.

See [the screenshot evidence](evidence/studio-record-20261012/README.md). This branch is stacked on References/exports PR45; Terms44, Insights46 and streamlined signup47 are separate reviews.
