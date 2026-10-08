# PR #5 assertion audit

Audit of all test diffs behind the 126 stale repairs, including removed/replaced assertions and their fixture dependencies. No `expect.anything`, catch-all value matcher, test skip, quarantine or removed security assertion was used to obtain green results. This is a source review plus executed tests, not a formal proof of assertion equivalence.

## Precision issues found and corrected before merge

| File | Earlier repair / issue | Correction |
| --- | --- | --- |
| tests/mobile-studio-routing.test.mjs | `undefined` became a loose `typeof function` check for the new Cite creation callback. | Assert exact `requestMobilePublish` identity, invoke it, assert the exact `create` call. WEB/guest remain exactly undefined. |
| tests/shared-entry.test.mjs | Exact old return path became only `intent.kind`. | Assert the entire current `{intent:{kind:'my-profile'},view:'signIn'}` object; signup return-path tests remain. |
| tests/profile-collections.test.mjs | Overview header lookup searched descendants instead of asserting sibling position. | Restore first sibling assertion after excluding only the newly inserted ScreenBack control. Existing child-position/identity assertions remain. |
| tests/profile-collections.test.mjs | New `can_view_profile_connections` fixture branch did not check its target argument. | Assert the exact target profile ID before the denied permission response. Counts/error behavior remains exact. |
| tests/shared-preview.test.mjs | Avatar helper omitted two checks previously in the cover helper. | Restore exact `twitter:card=summary_large_image` and the prohibition on generic branding/fallback artwork. Avatar URL and 800x800 dimensions remain exact; cover assertions remain on project/category routes. |
| tests/presentation-boundary.test.mjs | Compound host regex accepted arbitrary extra class names. | Restrict the extra class to `theme-dark` or `theme-light`; add a negative arbitrary-class case. Keep sibling/negated/wrong-platform/lookalike negatives. |
| tests/mobile-back-navigation.test.mjs | WEB's actual New message button was bypassed in favour of a global handler. | Restore pressing the actual WEB button; mobile uses its registered global action. |

Additional tightening: recovery checks assert exactly one enabled Save button instead of relying solely on `.every()`; Settings label lookup requires a button, not any clickable ancestor. Neither is a catch-all matcher.

## Intentional retired-contract exceptions (not represented as unchanged assertions)

| Tests / file | Removed or changed coverage | Reason and retained current assertions |
| --- | --- | --- |
| account-registration | Mobile's mandatory Welcome pause/continue. | Current registration completes once immediately; exact completion array and absent Welcome are asserted. Missing-image pause and cleanup remain. |
| media-comments-popover (guest and two recovery tests) | Five old Like/Bookmark/Repost/comments/share controls reduced to three relevant guest controls and one Save recovery control. | Current page bar exposes Save, Cite, Share and comments. Removed Like/Repost controls cannot be required there; Cite auth intent has dedicated citation coverage. Exact action/gate counts and account destination, no writes and explicit retry remain. |
| profile-collections: mobile Profile options / WEB and shared profiles | Hidden links and collapse/reopen expectations on MOBILE. | Mobile header links/counts are permanently visible and options are in the global sheet. Exact link values, action order, owner/visitor permissions and WEB disclosure remain. The helper checks the mobile global control rather than pretending to click a removed local toggle. |
| profile-collections: connection profiles | Connection-specific Back button label. | Replaced by the exact current pull-return accessible label, with exact history return and fallback connection URL. WEB unchanged. |
| shared-preview | Profile's chosen project cover, headline/school OG copy and Storage signing count. | Profile card uses exact avatar URL, dimensions and public count; private fields remain omitted. Cover order/pinning, abort, visibility, cache isolation and escaping tests target the project/category routes that still use covers. No relaxed expected text. |
| Studio workbench/header tests | Insights/Continue shortcuts in Studio. | They are no longer header controls. Exact Bookmarks-only action array and absent Insights are asserted; creation is tested via its actual callback. |
| publish-completion | Local-checkpoint failure on closing the first-project flow. | Current flow uses async discard. Exact failed-discard no-close and successful-discard close counts, transfer locks and disabled editor fields remain. |
| profile-onboarding / project-descriptions / settings | Old root/children-string locations. | Follow the actual picker wrapper, FormattedText.text, or button label span; exact label/value/disabled/error/content/navigation assertions remain. |
| media-interaction-state | Like as the optimistic race-write example. | Like is capability-disabled; use Repost with the same exact payload, pending kind, optimistic values and confirmed counts. Legacy Like service/capability tests remain. Save asserts private payload exactly. |
| three separately classified dead mobile viewer contracts | Inline engagement toggle, its focus/dismissal and description-panel overlap. | Replace those obsolete-panel assertions with exact information-sheet project ID, dismissal/swipe ownership, selected attachment continuity and unchanged WEB rail. These three are not counted among the 126 stale repairs. No production component changed. |

The CSS scope matcher intentionally recognizes the current `app-shell` as well as `codex-shell`, named theme classes, light/dark onboarding attributes, and four exact mobile document-scrollbar selectors/declarations. That is a bounded matcher expansion, not an `anything` assertion. Incorrect platform, sibling, negation, arbitrary class and lookalike attributes still fail.

## Hosted Ubuntu failure

The first hosted runs passed WEB, Windows Node, PDF and video jobs; Ubuntu Node failed one checkpoint test on its diagnostic string. POSIX Git rejects `linked/file.txt` beyond a symlink during `check-ignore`, before the explicit lstat guard; Windows junctions reach the guard. The test now expects the exact POSIX Git fail-closed error or the existing Windows link/junction diagnostic. It still requires blocked state, no checkpoint repository, no scanner/push calls, an intact symlink and unchanged outside content. No error catch-all, skip or checkpoint runner change.

Scope: tests, CI setup, test runner preflight and documentation only. No `src/`, production Sites worker, PDF/video worker or checkpoint-runner implementation changes. The three contract replacements are tests; the setup fix is `scripts/run-node-tests.mjs`, used for verification only. Therefore merging PR #5 does not require publishing a new Site; Sites 354 remains live.

Focused strengthened checks: 140/140 plus 15/15 pass locally. Hosted green status must be verified on the exact final PR head before the authorized merge.
