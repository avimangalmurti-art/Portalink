# Mass-launch blockers - review status

PR: https://github.com/avimangalmurti-art/Portalink/pull/32

No publish, applied SQL, production Storage write, deletion enabling, or monitor configuration occurred. This is implementation readiness, not launch clearance.

| Item | Prepared and verified | Still required |
| --- | --- | --- |
| PDF pages | Sequential browser WebP800/1600, cap60, immutable citation-folder paths, capability gate, partial/failed-page PDF fallback; explicit owner-run Node backfill; PGlite validates owner/public/object/path/count rules | Separate review of pending202610090001 Storage guard; apply approved SQL; owner backfill; real before/after page waterfalls and transfer totals |
| Pooling | Actual URL/protocol inventory and Small budget guidance in scaling.md; no Nano assumption found | Current server requests are HTTPS PostgREST/Auth/Storage, not raw Postgres. Supavisor transaction routing/caps not implemented by changing an API URL; provider topology decision needed. MCP PR6 remains separate |
| Account deletion | Pending202610090002 unchanged reviewed SQL body, both gates false; disabled request/status/cancel/tick adapter; synthetic full-history13 safety checks | portalink-staging identity/access: root.env.staging.local absent; dashboard only shows production and existing onboarding sandbox. No substitution. Apply history with Journey prerequisite. Actual Storage/TUS/PDF/Auth/re-register/concurrency/D1 checks, endpoint hosting and durable retries remain |
| Uptime | Local health200 against real anonymous citation resolver;503/error/timeout/HEAD tests; exact three monitor URLs in scaling.md | Owner creates UptimeRobot monitors/email contact. Free5min cannot provide requested1min. Production health undeployed; dashboard alerts not configured |
| CI | Locked install, type/lint/full Node database checks Linux/Windows, guarded build, visitor initial JS/CSS gzip350000 gate; environment-secret release artifacts and manual production approval gate | Supported headless Sites publish integration missing; automatic staging/manual production deployment not claimed. Environment secrets/reviewers still need owner configuration |
| Video | Capability off avoids video_processing_jobs status/retry queries; focused tests verify zero video lookups | Live project-view waterfall after approved release |

## Performance baseline

Live Paper Pens page citation1b5e9529-f180-4632-a9fd-c87428472e5a had renderedPages0. Original-size metadata72,529,436bytes; anonymous resolver450ms in a single HTTP probe. These are not browser transfer/timing totals (PDF range requests can fetch less than the original). Browser confirmed canvas fallback, no rendered preview image. Before screenshot is saved in the owned worktree ignored logs/cite-before.png. No after result can be measured honestly until approved schema/backfill/release.

Read-only catalog/EXPLAIN proposal: supabase/pending/launch_readiness_catalog_checks.sql. It has not run; no live plan evidence claimed.

## Validation

Main5151636 prior hosted Linux/Windows baseline1627pass0fail. Earlier task Windows suite1638pass0fail before final partial-preview viewer change. Corrected source6bb1180 passes1641/0 on hosted Linux and Windows; local sequential full run1641/0. Hosted web, PDF9/9 and video18/18 pass. Final focused PDF fallback zoom regression passes3/3; receipt commit CI will repeat the full checks. Typecheck and production environment/graph guards pass; lint0errors/111existingwarnings. Local initial visitor graph339950bytesgzip (hosted339934), below350000. Focused correction16tests pass, and in-memory deletion13checks pass. One sandbox run was blocked on disposable Git configs; a later run overlapped build cleanup with artifact tests. Those runs do not establish source regressions; final validation is sequential.
