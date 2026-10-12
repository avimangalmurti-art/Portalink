# Citation destination and route errors

Task branch `codex/citation-card-conformance` starts from reviewed `github/main` (`5c3f7f2`). No pending Terms, Studio, Insights, signup, security or Your record branches were merged into this work. Root checkout and its unrelated edits are preserved.

The citation destination uses the Terms reference card/pill typography, dark by default, and reads only the creator's existing `public_appearance` projection. Explicit light/dark and automatic system theme are respected. The original supplied PDF is now retained at the requested reference path, `docs/design/terms-sheet/Portalink-terms-sheet.pdf`; that path was absent on main.

Public citation reading uses the existing anonymous resolver, cited-in RPC, profile appearance projection and Storage signing policy. It does not implement new visibility rules or access the owner profile bundle. The existing authentication/mutation services load when Cite is pressed; the document renderer remains lazy. Plain-text/BibTeX copy uses the existing citation formatting, including on view-only work: attribution does not confer reproduction permission. Licence URLs and JSON-LD are unchanged. Share uses native sharing when available and copies the URL otherwise.

RouteError renders not-found, no-access, expired and network failures in the existing workspace shell; visitor destinations have no dock. Signed-in member error screens retain the existing navigation (mobile dock, desktop sidebar). Inline action failures and popup retry controls retain their existing presentation. Unknown/private public citation identifiers remain indistinguishable HTTP 404s. Worker citation failures render the citation entry with the appropriate HTTP status and no-store policy rather than a plain-text response.

## Verification

The full Node regression run passes all 1,652 tests. Three added Cite lifecycle tests cover authentication-host retention, cancellation and reopening after confirmed sign-in; the final focused run passes 114 checks, including the updated error/navigation harnesses. Typecheck, lint (zero errors; existing warnings plus the RouteError Fast Refresh export warning) and client/worker builds pass, including production main/visitor host-key guards.

Four stored citation markup snapshots, shared error cases, anonymous read/signing behavior and emitted initial bundle gates are tested. The visitor regression guard still excludes unopened product features. Initial `/cite` JavaScript plus CSS is 162,159 bytes (155,930 JS + 6,229 CSS), below the 350 KB gate; no auth SDK, router or PDF renderer occurs in that initial closure; editor components are absent from its entire static/dynamic closure. Document/auth modules load only as needed; their bytes are not described as part of the initial gate.

Real app browser checks include copy plain text/BibTeX, Cite open/close and restored focus, guest Create account opening the existing appearance dialog and Back returning to the citation, dark default/light creator appearance, non-empty cited-in rows and absence of an empty list, real PDF painting, 390/420/430 mobile widths, 1280 desktop, signed-in/guest error shells. A connected public citation resolved and its anonymously signed image returned HTTP 200 using the existing backend; no credential value or signed URL was logged. A clean browser runtime is checked after HMR fixture iteration.

See [screenshots](evidence/citation-cards-20261012/README.md). Most use synthetic services, not the user's account. No physical iPhone testing, real authentication mutation or citation submission is claimed.

GitHub CI did not start any of its five jobs: the account is blocked by failed payments or its spending limit, according to check-run annotations. No remote test success is claimed. Restore GitHub Actions eligibility and rerun required checks before merge.

## Release boundary

No database change is needed. No SQL, Auth configuration, worker, Sites deployment or merge is authorized or performed. Review the draft PR and screenshots before approving release. Existing unapplied migrations and unpublished tasks remain separate. Before publishing from reviewed main, retain the separately reviewed fixes currently live from PR42; this source branch must not be used to roll those back.
