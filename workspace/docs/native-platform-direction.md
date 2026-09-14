# Native platform direction

Recorded 2026-09-14. This is an architectural direction for later native work,
not authorization to create an app, install a framework, move source, change a
backend, or begin store delivery. See [current architecture](current-architecture.md)
for implemented behavior and [migration status](migration-status.md) for the
limits of deployment evidence.

## One product across web, iOS, and Android

Keep the existing Supabase project, Auth/accounts, database, Storage, account
and content identifiers, permissions, and user data. Web and future native
clients use that same product core. No agent-specific backend or separate
native account system is planned.

Existing page interactions and saved pages also use the Sites worker's D1
store. Preserve its records and identifiers. Native work will need an
appropriate authenticated API adapter for that capability; any later API
rehosting or data migration needs a separate explicit plan and authorization.
The presence of Supabase elsewhere does not move D1 data into Supabase.

React Native with Expo is the leading candidate for iOS/Android, but has not
been selected or installed. Validate the framework against Portalink's actual
media, authentication, background, and distribution requirements when native
implementation begins. Consider a monorepo at that point so clients and useful
shared packages can evolve together. Keep the existing repository layout now.

## Reuse boundaries

The useful shared surface is domain logic, types, validation, service/API
contracts, and backend rules. Browser components, CSS, DOM behavior, routing,
storage, and media integration need platform decisions; do not assume the
current browser application can be imported as native UI.

The existing `AppPresentation` boundary still selects WEB/MOBILE for the
browser/PWA and must be preserved. Future native presentation can differ while
retaining the same authentication, permissions, validation, and product rules.
Extract shared packages only when an actual native use case justifies them.

## Source findings to resolve in later scoped work

These conclusions come from the inspected repository, not a live-service audit:

- [The Sites worker](../src/sites-worker.ts) authenticates users for writes and
  scopes saved-page lists to an account, but does not visibly check access to
  the target project/attachment before page-interaction reads or additions.
  Authentication must be paired with resource authorization; review this
  boundary separately before broadening API access.
- [Multipart playback](../src/services/supabase/multipartMedia.ts) registers a
  browser service worker and uses browser URLs, messaging, and signed Storage
  URLs. A native media adapter must preserve the existing multipart data and
  access rules while supporting native playback/download behavior.
- Browser Auth callbacks, local/session storage, IndexedDB registration state,
  and `File`/`Blob` upload contracts need native adapters. No corresponding
  native implementations are present in this task.
- Account deletion remains hard-disabled. Its existing release gate includes
  shared-conversation preservation and delayed, resumable deletion; the design
  must also review the separate D1 data before any re-enablement. No real user
  accounts or files should be deleted for verification.
- In-app notification functionality is present; device push registration and
  delivery were not found in the inspected source. Native push and its backend
  delivery integration remain future features.

Future native build and delivery pipelines, including EAS, signing, and store
submission, must explicitly exclude `autosave/**` recovery branches. Source
checkpointing never triggers builds or delivery. Framework selection, native
scaffolding, monorepo changes, backend changes, and deployment each remain
separate reviewable work.
