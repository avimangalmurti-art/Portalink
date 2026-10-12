# Mobile Home conformance review

Task branch: `codex/home-card-conformance`, based on reviewed `github/main` at `5c3f7f2`.

Home uses the existing dock and contextual Actions button. Actions includes Explore the world, Search accounts (the old person-icon callback), and View profile. The top shortcut row is removed. Pulling down at the top refreshes once; short pulls, horizontal drags, pinches, busy feeds and open modal sheets do not trigger it. Refresh retains existing cards and reports failures.

Mobile artwork has fixed 16px side gutters. The saved column count is used when 150px cards and the existing 4px gaps fit; otherwise Home renders two columns. Responsive fallback does not save a preference. Home zoom gestures obey that same fit limit. The optional fit projection leaves other walls and desktop density unchanged.

The This week component, its copy, styling and spacing are unchanged. City feeds retain their local responsive density. No authentication, database, worker, visitor or other screen changes.

## Evidence

[Browser screenshots and verification limits](evidence/home-conformance-20261012/README.md). Actual application components run with synthetic, page-local services; no production account/content writes. Mobile widths 375, 390 and 430 have no document overflow, two fitted columns and the dock. At 600px a saved three-column layout fits; desktop at 1280px retains five saved columns, has no overflow, and reports no runtime errors in a clean tab. Pull-to-refresh exercises native TouchEvents through the actual hook and discovery refresh path, with one request for a valid pull and none for short/pinch gestures. Physical iPhone touch and Safari behavior are unverified.

Typecheck and production client/worker build pass, including configured main/visitor Supabase graph verification. Lint has zero errors and 111 existing warnings. Focused Home/zoom/context/wall tests: 88 pass. Full Node suite: 1,644 pass, 0 fail, 0 skipped.

## Release boundary

Draft review only: no merge, SQL, Sites publication or worker deployment. Current live source includes separate pending review changes (including PR42); release integration must retain those changes rather than publishing this branch alone over the current live version. Existing design-system part 1 remains a separate PR49.

Draft PR: https://github.com/avimangalmurti-art/Portalink/pull/50. Implementation commit: `582532c`. All five GitHub CI jobs on this implementation were blocked before starting by account billing/spending limits; local checks above passed. No CI configuration or protection was bypassed.
