# Owner menu, portal publishing and test repairs

Publication update: reviewed fixes were published as **Sites439** on 16 October 2026 from `1a51771aa2f79f0bf493abc80c11c2535457272a`. Google/Auth, production SQL and provider changes remain excluded. The preparation narrative below records the local review stage.

Prepared locally on 16 October 2026 in `logs/apple-icon-release`, branch `codex/loading-recovery`, based on source `8c9a6c696c8f5279c9db68f73721b0f88d1a5c08` (live Sites 438). These changes are uncommitted and unpublished pending review. The earlier [redundancy audit](redundancy-audit-2026-10-16.md) remains a historical record of that release.

## Behavior corrections

- **R01: Empty owner menu.** `MobileProjectPopup` now determines whether any callback or context command can run before supplying options content or its trigger. Owners without handlers, including an empty context object, see no empty menu. A single description command still produces a working one-command menu. Existing editor, options and deletion callbacks retain dismissal order.
- **R02: Stale portal publishing.** Prepared project metadata cannot override current owner-profile portal membership. The details-first handoff invalidates the profile cache and reads the owner overview before accepting a portal. Missing portals, wrong-owner responses and failed reads block uploads.
- The setup form remains mounted for its original owner account if the profile refresh fails. It retains metadata and the selected portal, including a newly created portal, so retry confirms that portal without creating another. The retained option is presentation state, never permission to upload: fresh confirmation and the publisher membership/account guard still apply. Leaving the form during confirmation prevents its late response from opening uploads.

## Coverage repairs

| Area | Repair and retained assertions |
| --- | --- |
| Owner popup | Explicit no-handler/empty-context regressions and one-command menu; dismissal and command callbacks retained. |
| Project setup | Confirmation failure/retry, one creation only, metadata retention, existing selection through profile failure, pending-confirmation unmount. |
| App publishing handoff | Actual App callback invalidates before the overview read; wrong owner/missing portal/read errors reject; prepared IDs cannot bypass membership/account guards. Source extraction also rejects syntax errors. |
| Initial project and onboarding | Fixtures include current setup state/setters; mobile enters details before creating a portal or draft. |
| Mobile Studio routing | Close/reset fixtures include current setup state. |
| Studio header | Overview renders Insights; current header ownership and fallback rules remain checked. |
| Profile link / appearance | Required viewport hook and URLSearchParams fixtures supplied. |
| Then/Now | Tests use canonical pair addition and reject legacy profile-update writes. |
| Globe search | Search is asserted inside the header; distinct WEB/MOBILE globe dimensions and selection behavior retained. |
| CSS presentation boundary | Explicit root-prefixed presentation hosts accepted, with negative sibling/negation/lookalike cases retained. Component-specific icon styles are imported at the main entry and the link viewport rules live in that feature stylesheet with unchanged declarations. |
| Shared bundle database | Disposable DB installs the real Journey prerequisite before the timeline migration. Existing public/private, ownership, immutable cover paths, revisions and privacy-transition assertions remain intact. No production migration was changed. |

## Verification

Final verification completed on the local review changes. Raw output and fixture artifacts are ignored under `logs/redundancy-fixes/`.

- Focused repaired suites: **70 passed, zero failed/skipped** (11 files).
- Shared-bundle database repair: **6 passed, zero failed/skipped** in isolated PGlite.
- Typecheck: passed. Production build: passed; configured Supabase host/key verified in both main and visitor graphs without exposing values.
- Full lint: **0 errors, 114 pre-existing warnings**. No warnings were suppressed.
- First complete diagnostic run: **2,058 tests, 2,057 passed, one failed, zero skipped**. The failure identified the missing Journey fixture prerequisite; repaired above. **Final complete run: 2,059 passed, zero failed/cancelled/skipped in 410.798 seconds**, including required local database coverage (`scripts/run-node-tests.mjs`, exit 0).
- Browser fixture: actual popup and setup components with synthetic services; outbound connections blocked by CSP. At 420x912, empty owner trigger absent; one edit action opens/runs; simulated confirmation error retains details; retry succeeds without duplicate creation. At 390x500, header submit remains reachable, form scrolls and no horizontal overflow. At 1280x900, popup and setup fit without overflow and owner action works. No fixture error/warning console messages observed.
- Review capture: `logs/redundancy-fixes/mobile-recovery.png` (synthetic data).

PGlite 0.5.8 was installed into the ignored `logs/redundancy-fixes/tools` directory, following the existing CI isolated-tools pattern. Application dependencies and lockfiles are unchanged. To repeat the complete suite after a build, point `PGLITE_MODULE_PATH` at that directory's `node_modules/@electric-sql/pglite/dist/index.js`, then run `node scripts/run-node-tests.mjs`. This runner sets both supported PGlite variables and bounds concurrency to two. Git checkpoint tests use disposable temporary repositories; no working-repository history was changed.

## Limits and release boundary

No deployment, production SQL, provider settings, resources, account-data changes or publishing occurred. Existing Supabase, Sites worker and D1 remain unchanged. Held Google/Auth eligibility/SQL/legal work in the separate adult-launch checkout is excluded. Tests using SQL ran only inside disposable local PGlite databases; these results do not establish applied production schema state or live permissions. Browser checks are synthetic local integration/layout evidence, not a physical iPhone or real-account upload test.

Unrelated audit items R03-R07 (CSS override debt, duplicate chooser presentation, dead publisher props, unused adapters/modules) remain for separate decisions. No broad cleanup was performed. Review these local changes before authorizing a release.
