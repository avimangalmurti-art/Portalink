# Portalink redundancy audit

Audited release: Sites 438, source `8c9a6c696c8f5279c9db68f73721b0f88d1a5c08`, on 16 October 2026. The application source was not changed during this audit. This report and the handoff are local documentation only.

Portalink has confirmed maintenance redundancy, two reproducible interface edge cases, and gaps in the broader test suite. The highest-value next step is to fix the two interface cases and restore trustworthy integration coverage before consolidating CSS or deleting old components. No backend permission bypass was established.

## Scope and interpretation

This is a source, test and emitted-bundle audit of the current web application, including MOBILE, WEB, public portfolios, citation entry and the Sites worker. It covers duplicate or overlapping implementation, unused application paths, repeated data access protections and repeated interface controls. It is not a backup restoration, regional failover, production load, penetration or provider-configuration test. Held Google eligibility/Auth, SQL migrations and legal drafts were not activated or modified.

No production messages, uploads, project creation, account edits, SQL, resource creation, publication or settings changes were performed. Existing tests can create disposable local repositories and simulated databases; those are not production data operations. No new dependencies were installed.

## Findings and recommended corrections

Severity describes practical priority: P2 needs a targeted fix or verified cleanup; P3 is lower-risk maintenance debt. Static candidates are distinguished from reproduced behavior.

| ID | Priority | Finding | Evidence | Recommended correction |
| --- | --- | --- | --- | --- |
| R01 | P2 | Owner popup can still show an empty options menu | [MobileProjectPopup.tsx](../src/components/media/MobileProjectPopup.tsx#L78) supplies an owner-actions React element whenever the viewer owns the work, even with no actionable handlers. The actual owner-actions function then renders zero buttons. A local probe reproduced `advertisesOptions: true` and `renderedButtons: 0`. | Compute available commands first; omit options content and its trigger when the command list is empty. Add an owner-with-no-handlers regression test. This supplements the existing visitor/no-handler removal. |
| R02 | P2 | Prepared portal fallback can outlive current profile membership | [App.tsx](../src/App.tsx#L1076) accepts either current profile membership or the prepared portal ID. A local evaluation with matching authenticated account/owner, an open publisher and an empty refreshed category list still returned true when the prepared ID matched. | Limit the prepared-portal exception to the creation/refresh transition and reconcile it after an authoritative refresh. Cover a deleted/unavailable portal and account changes. This probe demonstrates stale UI eligibility, not a successful forbidden server write. |
| R03 | P2 | Portal popup geometry and materials have competing definitions | [mobile.css](../src/presentation/mobile/mobile.css#L1901) defines the same profile-popup selector at lines 1901, 4567 and 5488; earlier 70dvh/640px geometry is superseded by the newer raised 82dvh/780px frame. [public-mobile.css](../src/visitor/mobile/public-mobile.css#L2528) repeats its dialog selector at 2528, 2559 and 2583. [mobile-project-popup.css](../src/components/media/mobile-project-popup.css#L41) sets glass styling, while [index.css](../src/index.css#L5579) sets navigation material for the same selector with stronger declarations. | Consolidate each surface's authoritative geometry/material rules, retaining platform and reduced-transparency variants. Compare before/after computed styles at phone, short-screen and desktop widths. These are overlapping definitions, not all identical copies. |
| R04 | P2 | Main-platform and public portal chooser markup are separate implementations | [PortalsPage.tsx](../src/features/profile/PortalsPage.tsx#L33) and [SharedProfileSidebar.tsx](../src/components/profile/SharedProfileSidebar.tsx#L52) independently own list/card state, headers and portal row markup while sharing CSS classes. Recent matching changes had to touch both. | Extract a small read-only portal chooser presentation with explicit action slots. Keep owner management, drag/reorder and visitor permissions in their existing controllers. Do not merge permission logic just to remove markup repetition. |
| R05 | P3 | Publisher retains unreachable fallback state and unused props | [PublishProjectDialog.tsx](../src/features/publishing/PublishProjectDialog.tsx#L182) enters MobilePublishFlow only when `isMobile || firstProject`; inside that branch the false sides of the identical conditional, including `mobileEditingStep`, cannot be selected. `resumeDraft` is declared but not destructured/consumed. App's `publishResumeDraft` is only cleared, never populated. [MobilePublishFlow.tsx](../src/features/publishing/MobilePublishFlow.tsx#L22) receives `categoryLabel` without reading it; its firstProject name/categories/onSkip members are also not read there. | Remove dead state/props after confirming intended draft policy. Do not silently re-enable saved-draft or activation functionality as cleanup. Retain the actual shared publishing lifecycle and current first-project marker. |
| R06 | P3 | Participant-list service surface has no current UI caller | `listProjectParticipants` remains in [interfaces.ts](../src/services/interfaces.ts#L461) and [communityServices.ts](../src/services/supabase/communityServices.ts#L377); the removed popup participant section was the only source caller found. | Decide whether to retain a documented service capability or remove the unused client interface/adapter. Do not delete an RPC or migrate backend data without separate review and authorization. |
| R07 | P3 | Eleven source modules are outside the current application entry graphs | Import graph scan and emitted client module graph both exclude the modules listed below. Several are older alternative presentation/activation surfaces. | Review against product intent, tests and future plans before deleting. They are maintenance candidates; their absence from the emitted graph means deleting them does not establish a current download-size saving. |
| R08 | P2 | Broader integration tests no longer fully represent current behavior | Full-suite diagnostics include missing mocks for projectSetup state, old mobile upload-first expectations, missing useDialogViewport and URLSearchParams fixtures, and a CSS boundary test rejecting the current global import. | Repair fixtures and revise superseded expectations while adding end-to-end coverage for the new details-first flow and account/portal transitions. Preserve genuine assertions; do not simply delete failing tests or weaken ownership checks. |

## Source inventory and scan results

The scan inspected 483 JavaScript/TypeScript source files and 47 CSS files. Roots were `src/index.tsx`, `src/visitor/index.tsx`, `src/citation/index.tsx` and `src/sites-worker.ts`, reflecting the three HTML entries and worker. The initial scan omitted the citation root; that was corrected before reporting the inventory.

Across the CSS sources, 3,891 rules produced 502 selector/context groups with more than one definition. This is a triage count, **not 502 defects**: token groups, deliberate overrides, repeated keyframe steps and platform-specific presentations can be intentional. R03 identifies specific competing definitions worth consolidating.

The exact normalized-code scan found zero repeated 20-line windows spanning different code files. It ignored blank lines and import lines. This does not detect renamed variables, semantic clones, short repeated fragments or duplicated CSS; R04 remains a confirmed presentation duplication despite that result.

Source scale helps explain the cascade risk: `src/index.css` has 5,696 lines / 232,653 bytes; `mobile.css` 5,521 lines / 281,832 bytes; public mobile CSS 2,586 lines / 108,054 bytes; web frame CSS 84 lines / 3,194 bytes. Raw source sizes are not network transfer measurements or evidence that every rule is unused.

### Modules requiring retention or deletion review

| Candidate module | Interpretation |
| --- | --- |
| `src/components/profile/SharedSignInBar.tsx` | Unreached legacy shared sign-in presentation; check intended public auth entry paths before removal. |
| `src/components/ui/IconButton.tsx` | Unadopted reusable control; could be retained as a design-system primitive rather than deleted automatically. |
| `src/data/cityAccents.ts` | Unreached data module; verify no non-source consumer before removal. |
| `src/features/journey/JourneyCalendar.tsx` | Older calendar presentation; compare current Timeline workflow before retiring. |
| `src/features/journey/JourneyMonthCalendar.tsx` | Alternative calendar presentation; same review requirement. |
| `src/features/publishing/activationState.ts` | Activation-related helper; respect held/disabled activation scope. |
| `src/features/publishing/FirstProjectFiles.tsx` | Older first-project upload form, still mentioned by tests. Do not confuse tests with a current UI caller. |
| `src/presentation/mobile/MobilePillHeader.tsx` | Unreached presentation primitive. |
| `src/presentation/mobile/MobileProfileBack.tsx` | Unreached back-control wrapper. |
| `src/visitor/mobile/PublicPortfolioWelcome.tsx` | Older public welcome surface; review current visitor onboarding intent. |
| `src/visitor/mobile/publicWelcome.ts` | Helper for the unreached public welcome surface. |

Three ambient `.d.ts` files also appeared outside runtime imports and were deliberately excluded from this deletion-candidate list. Global type declarations need not be imported to be effective. Dynamic external references and planned design-system adoption require human review even when source and emitted graphs agree.

## Repetition that is already controlled or intentional

- Engagement hooks share [EngagementContext.tsx](../src/contexts/EngagementContext.tsx#L182). `ensure` checks an account-scoped requested set before loading, so multiple mounted surfaces do not inherently mean duplicate engagement reads.
- FollowContentInfoPopup passes null to its comments hook when custom engagement content is provided; the custom popup section supplies its own count lifecycle. A null project ID is guarded in useProjectComments. The source does not establish a double comments request for that composition.
- Repeated Continue/check controls in the new project form are deliberate reachable affordances; the same form handler has an in-flight guard. Existing tests cover duplicate portal-creation prevention and explicit final publishing.
- Shared core services, presentation-specific shells, visitor entry bundles and the Sites worker/D1 store are intentional architecture boundaries. The separate worker data store is not a duplicate Supabase database to remove.
- Anonymous export fetching uses the existing endpoint, no-store behavior and a timeout; explicit retry is intentional recovery rather than an automatic duplicate download loop.
- Validation at both UI and service boundaries is intentional. Sharing pure rules is useful; removing service validation is not.

## Verification and evidence

Typecheck passed. Full lint completed with zero errors and 114 warnings. Production build passed, including the main and visitor Supabase configuration checks. Credentials were not printed or changed.

The complete existing Node suite was attempted, then repeated with `--test-concurrency=2`. The first attempt was interrupted under high resource pressure and included sandbox-denied temporary Git repository creation; it is not a completed test result. The controlled run allows local disposable Git fixtures and retains production boundaries. Database tests requiring PGlite cannot be established where that existing module/configuration is absent. Final controlled results and the complete failure inventory are recorded below.

Raw local evidence (ignored, not part of deployed application):

- `logs/redundancy-audit/static-scan.json` and `static-summary.json`: rule locations, source reachability candidates and clone results.
- `logs/redundancy-audit/probes.mjs` and `probes.jsonl`: pure local probes for R01 and R02, using actual component/expression code with controlled dependencies.
- `logs/redundancy-audit/node-controlled.log`: controlled full-suite output; `node-tests.log` is the interrupted first attempt.
- `logs/redundancy-audit/typecheck.log`, `lint.log`, `build.log`: standard check outputs.
- `logs/redundancy-audit/initial-failures.json`: preliminary diagnostics, superseded by final controlled results where they differ.

Reproduction uses existing dependencies only: `node.exe logs/redundancy-audit/scan.mjs`; `node.exe logs/redundancy-audit/probes.mjs`; `node.exe --test --test-concurrency=2 @(rg --files tests -g '*.test.mjs')`; and the existing npm typecheck/lint/build scripts. The repository's `scripts/run-node-tests.mjs` additionally requires `PGLITE_MODULE_PATH` pointing to an existing compatible installation and built visitor artifacts; do not run installation migrations to satisfy that requirement.

## Controlled test results

The completed controlled run reported **2,010 tests: 1,980 passed, 19 failed, 11 skipped, 0 cancelled** in 280.965 seconds. The run is not green. Four failed database files lack PGlite configuration/package availability; the remaining fifteen failures are test-fixture/expectation or boundary-policy review items listed individually below. Their failures are not proof that every named production behavior is broken. Conversely, R01 and R02 were independently reproduced and should not be dismissed as fixture problems.

The checkpoint tests that initially failed to create temporary Git repositories passed in the permitted controlled run. No real checkpoint store or application Git refs were modified by the audit tests.

| Test location | Reported failure | Classification and follow-up |
| --- | --- | --- |
| [account-session-devices-db.test.mjs:1](../tests/account-session-devices-db.test.mjs#L1) | tests/account-session-devices-db.test.mjs | Environment blocked: PGlite package or required module path absent. |
| [citations-database.test.mjs:1](../tests/citations-database.test.mjs#L1) | tests/citations-database.test.mjs | Environment blocked: PGlite package or required module path absent. |
| [external-references-db.test.mjs:1](../tests/external-references-db.test.mjs#L1) | tests/external-references-db.test.mjs | Environment blocked: PGlite package or required module path absent. |
| [first-publication.test.mjs:91](../tests/first-publication.test.mjs#L91) | cancelled onboarding abandons publication and browse does not require an account | VM fixture omits the current optional-setup setter. |
| [first-publication.test.mjs:102](../tests/first-publication.test.mjs#L102) | registration resumption retains the guest create intent through the first account reset | VM fixture omits the new project-setup setter; mobile upload-first expectation also needs revision where applicable. |
| [first-publication.test.mjs:147](../tests/first-publication.test.mjs#L147) | pending and open publishing never cross accounts, even before the reset effect runs | VM fixture omits the new project-setup setter; mobile upload-first expectation also needs revision where applicable. |
| [first-publication.test.mjs:165](../tests/first-publication.test.mjs#L165) | publisher visibility requires a category still owned by the current portfolio | VM fixture omits prepared-project state; repair fixture and retain membership/account assertions (see R02). |
| [first-publication.test.mjs:245](../tests/first-publication.test.mjs#L245) | mobile creation goes directly to the selected portal without a chooser | VM fixture omits the new project-setup setter; mobile upload-first expectation also needs revision where applicable. |
| [immediate-session-revocation-db.test.mjs:1](../tests/immediate-session-revocation-db.test.mjs#L1) | tests/immediate-session-revocation-db.test.mjs | Environment blocked: PGlite package or required module path absent. |
| [mobile-studio-routing.test.mjs:107](../tests/mobile-studio-routing.test.mjs#L107) | closing creation restores the mobile trigger without stealing another destination or dialog focus | VM fixture omits the new project-setup setter; mobile upload-first expectation also needs revision where applicable. |
| [onboarding-home-entry.test.mjs:7](../tests/onboarding-home-entry.test.mjs#L7) | mobile onboarding enters Home without opening publishing or clearing a saved activation | VM fixture omits the current optional-setup setter. |
| [onboarding-home-entry.test.mjs:26](../tests/onboarding-home-entry.test.mjs#L26) | first-project profile action uses the normal publisher and silently prepares an empty portal | Source locator/old automatic empty-portal expectation no longer matches the details-first flow. |
| [presentation-boundary.test.mjs:150](../tests/presentation-boundary.test.mjs#L150) | every platform CSS selector is scoped, including nested rules and selector lists | Guard rejects @import in mobile.css; inspect imported selectors and the import policy before changing the assertion. |
| [profile-link-reveal.test.mjs:18](../tests/profile-link-reveal.test.mjs#L18) | mobile Add reveals expanded fields smoothly and repeat taps create only one unfinished link | Strict dependency fixture omits useDialogViewport. |
| [profile-link-reveal.test.mjs:25](../tests/profile-link-reveal.test.mjs#L25) | reduced motion reveals without animation; WEB retains existing Add behavior | Strict dependency fixture omits useDialogViewport. |
| [public-appearance.test.mjs:188](../tests/public-appearance.test.mjs#L188) | public bootstrap honors a newly opened creator link while retaining guest read-only routing | VM fixture omits URLSearchParams. |
| [studio-header-navigation.test.mjs:38](../tests/studio-header-navigation.test.mjs#L38) | mobile Studio starts on Overview, and selecting Drafts switches the content with consistent header controls | Strict dependency fixture omits PersonalPages. |
| [then-now-screen.test.mjs:17](../tests/then-now-screen.test.mjs#L17) | pair chooser is a Back-enabled mobile screen and retains desktop dialog and shared saving | Fixture omits useTimelinePairs implementation. |
| [web-city-search.test.mjs:166](../tests/web-city-search.test.mjs#L166) | WEB and MOBILE expose the same directory search while retaining their globe dimensions | Expects aboveGlobe=true after search intentionally moved into the header. |

The eleven skipped cases were:

- feed RPC pages every eligible project in stable order and preserves public/private membership
- private Journey pairs survive opt-in changes but cannot be read by visitors
- PDF forward migration: permissions, real claims, fencing, completion and owner retries
- read-path migration skips an absent video pipeline without installing or altering it
- performance migrations retain privacy, original validation, atomic arrangements and bounded engagement
- unbounded Bio migration preserves profiles, optional fields and owner-only writes
- one-column density extends the existing constraint without changing saved data, defaults or access
- public search is bounded, indexed, finds older content and preserves private/hidden boundaries
- isolated SQL covers public bundle, private fallback, immutable paths, revisions and privacy transitions
- additional pairs enforce owner writes, visibility, duplicates, and cascade while preserving legacy
- video pipeline migration: backfill, visibility, token fencing, output integrity and owner retries

These skipped database checks do not establish production schema, retention, RLS or worker-pipeline correctness. Use an existing approved compatible isolated runtime to rerun them; do not apply SQL or enable production features as part of that test setup. Detailed final diagnostics are saved in `logs/redundancy-audit/final-failures.json`.

## Recommended next work

1. Fix R01 and R02 with focused regression coverage, keeping ownership checks and service validation intact.
2. Repair the full-suite fixture and expectation gaps in R08; run isolated database checks with an existing approved compatible PGlite runtime. Do not infer database correctness from skipped checks.
3. Consolidate only the portal-frame style groups in R03, with before/after computed-style and mobile/desktop screenshots, before attempting a broad CSS cleanup.
4. Share the read-only portal chooser presentation in R04, preserving management and visitor controllers.
5. Remove the unreachable publisher state/props in R05, then separately review the eleven candidate modules and participant service capability. Keep held features and backend changes out of routine cleanup.

No fixes or publication are included in this audit.
