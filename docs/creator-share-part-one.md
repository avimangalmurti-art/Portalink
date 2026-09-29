# Creator sharing — Part 1

Implementation and QA record, September 29, 2026. Part 1 is complete. The user
subsequently requested publication of all completed changes. Publication is
being prepared; its exact receipt belongs in `agent-handoff.md`.

## Scope and release boundary

The user requested **Part 1 only** of the creator-sharing changes, followed by
review before proceeding to Part 2, then authorized publishing completed changes.
Work continues in the owned
`logs/mobile-studio-20260929` worktree on `codex/creator-share-part-one`, based
on `5668e18`. Shared presentation applies to WEB and MOBILE; the document
reading adjustment applies only to MOBILE shared views.

The previous shared-entry and avatar/text-preview work is inherited from the
base. It has not been removed or implemented again. The new Part 2 metadata
request remains paused for review. No Sites worker or metadata source changes
belong to this Part 1 diff. Publication includes inherited Studio and shared-view
changes. It does not implement the new Part 2 request, apply SQL, change
dependencies, create a backend or deploy separate media workers. The pre-release
live deployment is Sites v270, source `caf7b21`.

## Implemented behavior

| Area | Part 1 behavior |
| --- | --- |
| Optional account bar | When a public creator identity is available, guests see “Viewing [name]'s portfolio”, Sign in and Create account. The bar sits at the bottom on MOBILE and aligns to the right above the workspace on WEB. It does not open authentication on entry. |
| Dismissal | Dismissal lasts for the tab session using session storage, with an in-memory fallback if storage is unavailable. The bar's measured height reserves space for the fixed MOBILE controls and safe area. Dismissal moves keyboard focus to the active content layer. |
| Identity | The creator name and city remain visible. The first line of the saved headline appears below the city in shared profiles; the full bio remains available through the existing more-options/bio surface. |
| Collections | Shared profile statistics, navigation and collection views say Collections. Existing route IDs and `?view=portals` remain unchanged. Ordinary profile terminology remains Portals. |
| Project covers | Shared galleries include published projects without a chosen cover. Existing chosen covers keep priority. A missing cover can use an existing image or the first page of an existing document, in attachment order. Existing rendered pages and the PDF renderer are reused; no generated image, upload or new storage object is created. |
| Document reading | A MOBILE shared document opens as a single-column vertical page stack using the available reading width. WEB and ordinary workspace density choices remain unchanged. Existing page focus/overview interactions remain. No creator preference is written. |
| Visitor actions | Shared project and page engagement/comments use the existing services and permission checks. Shared profile Follow and Message use the existing account flow. Creator edit, reorder, hide and publishing controls remain unavailable on shared routes, including when the creator views their own share. |
| Authentication return | Guest actions preserve the safe shared profile/category/project path, including the clicked media and page where applicable. Credential and callback parameters are removed. Signing in does not automatically save, follow or post on shared content: the visitor presses the intended action again. Dismissing authentication leaves no shared media write queued for a later sign-in. |

The implementation uses the existing AuthContext, route/onboarding flow,
profile and engagement providers, project/comment services and Sites/D1
page-interaction transport. The `interactionIntent` helper reuses the existing
shared-return-path sanitizer. Ordinary workspace media keeps its existing
explicit stored-action behavior; Part 1 changes the shared guest flow.

## Browser evidence

Completed checks below are reported by the owning browser session against the
actual application components in the isolated synthetic fixture.

| View and flow | Recorded result |
| --- | --- |
| MOBILE 390px, shared document | The document uses one vertical column and fits within the reading area, with no horizontal overflow. At an 844px viewport height, the account bar occupies 71.1875px at the bottom; fixed controls clear it by 8px. Double-click still focuses the selected page. |
| MOBILE 390px, page bookmark | A guest bookmark press opens the actual AuthDialog. Submitting the synthetic login returns to the same shared project with `page=1` and the selected media ID. The fixture bookmark state remains 0 after login; the next explicit bookmark press changes it to 1. |
| MOBILE 430px, identity and covers | City precedes the first-line headline. The full bio remains available through the existing more-options control. Existing rendered document-page, raw-PDF canvas and image cover fallbacks are visible. |
| MOBILE 430px, Message | A guest Message press opens authentication; synthetic sign-in returns to the same shared profile URL. No message is sent by signing in. |
| WEB 1280px shared entry and controls | Fresh profile and project deep links open without the welcome dialog, splash video or coach. The account bar sits in its own top row above the header/reader controls. Existing desktop document density is preserved. Create account opens the existing signup surface only on request; closing it restores shared content. |
| Dismissal and same-session reload | WEB profile and MOBILE document dismissal both survive the fixture's same-session reload, with no account dialog. MOBILE dismissal puts keyboard focus on the active content `main`. |
| Follow and comment round trips | MOBILE 430px Follow and WEB 1280px Post both open the actual sign-in form and return to the same shared URL after synthetic login. Comment submission does not occur automatically. |
| Ordinary owner and non-share workspace | WEB 1280px and MOBILE 390px ordinary profiles retain Portals wording and layout controls. The synthetic viewer's own profile retains Add a project, Edit profile and Copy public link, plus normal platform navigation. Shared owner-mode exclusion is additionally checked by source/automated review. |
| Console and cleanup | No new runtime error was observed; the existing React `fetchPriority` warning remains. No horizontal overflow in the checked 390px document and 1280px profile. Temporary QA tab closed and viewport reset. An optional final 430px document screenshot was interrupted by browser synchronization timeout; earlier 430px profile/auth checks were complete. |

### Fixture boundary

The ignored `logs/shared-view-qa` fixture uses actual App, authentication,
profile/sidebar/category/media components, presentation switching and CSS.
Generated profile/project/media data, the service registry and page-interaction
transport are isolated in memory. The actual authentication form accepts only
the fixture's synthetic identity through its substituted auth service; this is
not a live Supabase login. PDF/page and image examples are generated test data.
The fixture prevents these credentials and mutations from reaching connected
services. No real save, follow, comment, message, upload or external user-data
write is used for QA.

Browser results establish component behavior under those substitutions. They
do not certify live authentication/email confirmation, hosted RLS or D1
mutation behavior, external crawlers, a physical phone, installed-PWA behavior
or the software keyboard. Fixture source, bundles, screenshots and logs remain
ignored and must not enter a source commit or hosting archive.

## Automated checks and review

- Focused action/viewer/account-state run: **50/50 pass**, covering safe shared
  paths, page/media targets, no shared write on sign-in, cancellation/remount,
  subsequent deliberate writes, ordinary media replay preservation, account
  isolation and shared visitor controls without owner editing.
- Cover/document and identity/account-bar focused checks passed, including
  shared welcome suppression and unchanged ordinary behavior; these also form
  part of the full suite below, not an additional independent total.
- Typecheck: **pass**.
- Full lint: **0 errors / 84 existing warnings**, as reported by the owner.
- Client/server production build: **pass**, as reported by the owner.
- Full Node/PGlite suite: **1,023/1,023 pass, no failures or skips**.
- Independent root-diff review found no privacy or owner-mode blocker.
  `canAccessProfile` still denies private `/share/` profiles even to an owner
  or follower, and the account bar receives a name only when that profile is
  readable. Shared routes continue to exclude owner mode.
- Review found that bar dismissal could focus an exiting, inert screen during
  navigation. The owner corrected the selector to the active screen layer and
  updated its regression harness before the final full run.
- `src/sites-worker.ts`, `src/server/sharedPreview.ts` and
  `tests/shared-preview.test.mjs` were verified unchanged from `5668e18`.
- Independent final source review found no blocking regression in authentication
  return, cover ordering, mobile reading, bar geometry or owner restrictions.
  Release artifact/credential exclusions are checked again during packaging.

## Part 2 read-only audit — paused

The existing metadata implementation was inspected without edits or external
crawler requests. This audit records differences from the newly requested
Part 2 behavior; it does not authorize implementation or publication.

| Requested Part 2 area | Existing source and decision still needed |
| --- | --- |
| HTML response preference | Exact valid shared GET/HEAD routes serve navigation HTML even with wildcard or missing Accept. Explicit non-HTML Accept is not separately negotiated. Any change must preserve the existing deep-link/crawler cases. |
| Titles and descriptions | Profile title is `name \| Portalink`; project title is `project — name \| Portalink`. Descriptions normalize the record's headline, category blurb or project summary, up to 220 characters, then use a creator fallback. The requested title variants, 160-character limit and first-project-summary fallback are not implemented. |
| Record type and canonical | No per-record `og:type` assignment exists. Public resolved records already receive canonical and `og:url` metadata for the shared pathname without query/auth parameters. |
| Preview image choice | Only an existing trusted public Supabase profile avatar is eligible. Category/project cards are text-only. First-project/project cover lookup and a safe public-cover policy are not implemented; private media must not be signed into crawler HTML. |
| Dimensions and card format | No invented dimensions are emitted. Inherited image variants are cleared and shared cards use `summary`. Known source dimensions and conditional large-image behavior need deliberate design. |
| Fallback behavior | Private/missing/upstream-error targets keep generic text and no inherited image. Public no-cover records keep their real text, with an eligible avatar only for profiles. The requested generic no-cover treatment needs clarification before changing this behavior. |
| Five-minute caching | Shared HTML remains `private, no-store`, with conditional validators removed and visibility re-evaluated on each request. A five-minute cache would change that privacy boundary and requires a clear invalidation policy, excluding account/session/query state. |

The preserved worker protections are anonymous public-key-only lookup without
forwarded cookies/authorization; route and parent ID binding; public/visible
parent filters; returned-ID checks; escaped metadata; a two-second lookup
timeout; optional failures that do not block the app; bodyless HEAD without an
upstream metadata read; and unchanged ordinary routes.

Per-record text/canonical/privacy handling was published with `caf7b21` in
Sites v270. The later trusted-avatar and inherited-image cleanup is part of
the local base lineage. Neither source inspection nor the earlier tests prove
external card rendering or a future cache's invalidation behavior. Part 2 is
the explicit next review item and remains paused.
