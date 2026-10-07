# Shared view experience

Local source and QA record, September 29, 2026. Both requested changes are implemented; publication is separate.

Work continues in the owned `logs/mobile-studio-20260929` worktree on
`codex/shared-view-experience`, based on `13e5885`. Task 1 applies to public
shared views on **WEB and MOBILE**. The normal application retains its
existing controls and entry experience. Task 2 concerns the existing Sites
worker's public link metadata. Neither task authorizes publication, SQL,
new services, dependency changes or a separate media-worker release.

## Task 1: direct shared reading

| Area | Shared-view behavior |
| --- | --- |
| Entry | `/share/…` opens the shared content directly, without the welcome/landing media or startup splash. Session restoration can show its existing loading state; it does not introduce account entry over the work. |
| Identity | The creator's real name and headline remain visible. Shared navigation uses **Categories** and ordinary profile/project return labels. The existing `?view=portals` URL remains usable, resolving to the Categories view. |
| Reading controls | Shared profile galleries and project/category views omit layout/density, sort, panel-resize and gesture-coach controls. Project selection, project list, page overview and fullscreen reading remain available where applicable. |
| Sign in | An unobtrusive SharedSignInBar is offered to signed-out viewers. Opening it presents the actual authentication form without welcome media. Closing it returns focus to its trigger and preserves the shared content. Signed-in shared viewers do not receive this bar. |
| Normal app | Normal `/p/…` routes retain gallery Layout/Reset, mobile Portals terminology, the five-button dock and their usual startup behavior. Shared-only headline and simplified controls do not spread to ordinary profiles. |

Implementation is concentrated in `ApplicationBootstrap`, the App shared-route
boundary, `SharedSignInBar` and its stylesheet, `SharedProfileSidebar`, the
profile/gallery/category/media presentation guards, and the optional welcome
media behavior in `AuthDialog`/`AccountWelcomeSurface`. Shared data, route IDs,
authentication, permissions and underlying viewer capabilities remain on the
existing product core.

## Task 2: public link metadata

Profile/category/project title and description generation already existed in
source `caf7b21`, published as Sites v270. It is inherited behavior, not a new
metadata system in this task.

The existing `src/server/sharedPreview.ts` now uses each public profile's
stored avatar URL when it is HTTPS, on the configured Supabase origin and
inside the public avatars bucket. Credentials, query strings, fragments,
control characters and unsafe path segments are rejected. Both Open Graph
and Twitter image tags use the accepted avatar and creator-specific alt text.

All inherited image tags, dimensions and alt text are removed from shared
detail responses before adding an eligible avatar. Missing/unsafe avatars,
private/missing records and upstream failures therefore produce text-only
cards, using `twitter:card=summary`. Category/project text continues to
describe the exact shared record; there is no stored public primary image
for these records, so the worker does not sign private attachments or borrow
the creator's image. Root metadata remains unchanged. Anonymous visibility
queries, a two-second timeout, `private, no-store` responses and validator
removal remain in place.

An independent review found no remaining worker blockers, and all 11 focused
worker tests pass, including distinct profiles, unsafe images, privacy/error
fallbacks, HEAD, conditional requests and ordinary-route preservation. This
does not certify a deployed worker or external crawler's rendered card.

Review also caught and corrected the desktop account-creation return path.
Starting registration from the shared sign-in form now saves the same safe
shared destination on WEB and MOBILE, including email-verification metadata.
Credential query parameters are discarded. Ordinary desktop registration
retains its previous destination behavior; Settings return remains mobile-only.

## Browser evidence

The following checks are complete as reported by the owning browser session:

- Actual application, anonymous nonexistent-UUID shared route, 390px: no welcome
  or startup splash. Explicit Sign in opens the actual form with **zero welcome
  videos**; dismissal restores focus to the Sign in button. This checks public
  entry and the form lifecycle, not the availability of a real shared record.
- Full-App synthetic fixture, 390px: shared landing shows name, headline,
  Categories labels and the 57px sign-in bar. A project opens and its project
  list remains reachable, without layout or sort controls.
- Full-App synthetic fixture, 430px: shared drawer shows Categories, the creator
  headline and a profile-return path. Keyboard navigation and return were
  exercised.
- Full-App synthetic fixture, 1280px: shared landing/sidebar show Categories and
  the headline. Category/project presentation omits resize and density controls
  while retaining fullscreen reading. Explicit authentication form measures
  560×428px, fits the viewport, renders zero welcome videos and restores focus
  on dismissal.
- Synthetic signed-in shared view: the sign-in bar is absent.
- Normal `/p/…` comparison: WEB still has gallery Layout/Reset and its usual
  splash; MOBILE still has the five-button dock, Layout and Portals labels,
  without the shared-only inline headline.
- Legacy `?view=portals`, 390px: Categories is selected; its heading and category
  links use the canonical `/share/…/c/…` routes. Headline and sign-in bar remain
  visible, with no welcome media.
- No horizontal overflow was observed in the checked 390px, 430px or 1280px
  views. The existing React `fetchPriority` warning remains; no new runtime
  error was reported in these completed checks.

### Fixture boundary

The ignored `logs/shared-view-qa` fixture renders the actual
ApplicationBootstrap, App, Auth/ProfileData/Engagement providers, router,
presentation boundary, profile/sidebar/category/media components,
SharedSignInBar and AuthDialog. Its build collects actual component CSS. It
does not replace shared-entry or authentication presentation components.

Only the service registry, page-interaction transport and prototype-session
reader are substituted. One generated public profile, six image projects and
a separate visitor identity live in memory. SVG data URLs provide imagery;
existing local prototype helpers serve permitted reads, and mutations reject.
The in-memory auth service follows the actual AuthProvider subscription
contract. Actual form submission rejects; explicit QA controls switch the
synthetic identity for signed-in/out presentation checks. The page's
`localStorage` and `sessionStorage` are isolated in memory so synthetic creator
IDs and preferences do not remain in the preview origin's real storage.

The fixture build verifies one canonical adapter module and excludes connected
Supabase/runtime/production service modules. Its README records the exact
substitutions and reproduction controls. Fixture files, chunks, screenshots,
logs and source-graph manifests remain ignored and must not enter the source
commit or a hosting archive.

These checks do **not** establish live authentication/API behavior, real account
mutations, production privacy enforcement, physical-phone touch/keyboard,
installed-PWA behavior or public crawler/card rendering. No account, upload,
message or hosted data mutation was used to verify the design.

## Automated checks and review

- Task 1 focused guard/regression runs reported **79 passing** and **48 passing**
  checks. These are separate runs with potentially overlapping coverage; they
  are not added together as a unique-test total.
- Final focused worker/metadata checks: **11/11 pass**.
- Focused signup/confirmation/shared-entry checks after the desktop return-path
  correction: **34/34 pass**. One old mobile-only return-path assertion was
  updated to the requested ALL behavior before the final full run.
- Final full Node/PGlite runner: **1,004/1,004 pass, zero failures/skips**.
- Final typecheck: **pass**.
- Final lint: **0 errors / 84 existing warnings**.
- Final client/server production build: **pass**, with existing chunk/plugin warnings.
- Independent shared-entry and worker review: **no remaining blockers**.
- Staged whitespace, credential-marker and source/fixture exclusion checks: **pass**.

## Release state

**Local and unpublished.** This record does not claim a GitHub push/merge,
Sites publication, SQL application or separate PDF/video-worker deployment.
The last recorded live website is **Sites v270 / `caf7b21`**. The preceding
MOBILE Studio work is also local and unpublished on this branch lineage.

Existing Supabase accounts/Auth/Storage, Sites worker and D1 data remain the
same product services. The preceding PDF safety migration remains unapplied,
the separate PDF/video workers remain undeployed, and account deletion remains
disabled. Temporary QA tab is closed, viewport reset and owned preview5178
stopped. The handoff records the final checks and source state.
