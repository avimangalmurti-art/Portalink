# Current architecture

This is the source inventory for the existing Portalink application, recorded on 2026-09-14. It does not certify which migrations or workers are deployed. See [migration status](migration-status.md) and the dated [Sites deployment snapshot](sites-deployment.md). [Production architecture](production-architecture.md) is the target blueprint and growth plan, not an inventory of completed infrastructure.

## Application and presentation

Portalink has one React/TypeScript browser application built with Vite. The [client build](../vite.config.ts) writes `dist/client`; the [worker build](../vite.worker.config.ts) writes `dist/server/index.js`. The existing [build script](../package.json) produces both.

[src/index.tsx](../src/index.tsx) mounts the router, service registry, authentication, profile cache, engagement state, and application bootstrap. [AuthContext](../src/contexts/AuthContext.tsx) is the session source of truth. [routes.ts](../src/app/routes.ts) defines canonical URLs using stable record IDs, including the public `/share/` routes.

[AppPresentation](../src/presentation/AppPresentation.tsx) keeps one provider and root host. Its [single viewport selector](../src/presentation/useViewportPresentation.ts) selects MOBILE at `(max-width: 639px)` and WEB otherwise. Descendants use `usePresentation()`; resizing must not remount the application. Frame and platform differences live in [web.css](../src/presentation/web/web.css) and [mobile.css](../src/presentation/mobile/mobile.css), while much feature styling remains shared. Body-portalled surfaces need their own presentation scope. This is the existing browser/PWA presentation boundary.

## Services and backend responsibilities

| Boundary | Existing implementation |
| --- | --- |
| UI contracts and selection | [interfaces.ts](../src/services/interfaces.ts) defines typed service contracts; [services/index.ts](../src/services/index.ts) chooses implementations injected through `useServices()`. |
| Accounts and core content | [Supabase services](../src/services/supabase) handle Auth, profiles, projects, discovery, search, follows, comments, engagement, notifications, messaging, and private media. [SQL migrations](../supabase/migrations) define database/RPC/storage permissions. Client visibility is not authorization. |
| Individual-page interactions | [mediaInteractionRequest.ts](../src/features/media-interactions/mediaInteractionRequest.ts) calls the same-origin `/api/media-interactions` endpoints for page activity and saved pages. The [Sites worker](../src/sites-worker.ts) uses the existing D1 binding and verifies Supabase bearer sessions for authenticated actions. [drizzle](../drizzle) contains its schema source. This existing data store is separate from Supabase. |
| Media processing | [PDF worker](../workers/pdf_processor/README.md) and [video worker](../workers/video_processor/README.md) are separate Python services. Their queue, lease, and output contracts live with the Supabase migrations. A website build does not start or deploy them. |

The [Supabase client](../src/services/supabase/client.ts) fails closed when production configuration is missing. Valid Supabase configuration selects the connected core services even when the local runtime mode is `prototype`; changing that mode alone does not isolate live data. Preserve the existing local configuration for connected development. Explicitly simulated previews use placeholders as described in [dual-view development](dual-view-development.md).

Some unfinished domains expose unavailable capabilities in production. Source code, a passing build, and old worker verification notes are not evidence of active hosted services. Account deletion remains hard-disabled in the client and [edge endpoint](../supabase/functions/delete-account/index.ts). Its replacement remains in `supabase/pending`, subject to the [separate release gate](account-deletion-safety.md).

The September 29 source correction makes the page-interaction worker resolve
each target project, category and attachment through Supabase SELECT policies
with the caller's identity before reading or writing D1 activity. Anonymous
requests use the publishable key only; errors fail closed. Saved-page lists and
removal remain account-scoped so inaccessible saved entries can still be removed.
This correction is prepared locally, not yet deployed. Any future account-deletion
design must also explicitly account for existing D1 records.

The same source changes scope profile and engagement state to the current
account, discard late results from earlier sessions, and keep independent like
and save mutations from overwriting each other. Public share HTML gets anonymous,
visibility-filtered text metadata with no-store caching; it retains the existing
brand image. See the [release plan](trust-and-activation-release.md) for validation
and separate website, database and worker release states.

The inspected client/worker source contains in-app notifications but no device
push registration and delivery implementation. Native push is future work;
this statement does not establish the configuration of hosted services.

## Future native clients

Web, future iOS, and future Android clients continue one product with the same
existing Supabase project, accounts, profile IDs, backend authorization rules,
and shared data. Preserve the Sites worker/D1 data as well. The current service
contracts, domain types, and pure validation helpers identify useful reuse
boundaries; no extraction or new application is required for this tooling task.

The browser implementation is not a portable native SDK. Auth uses browser location and storage; [registration](../src/features/auth/registration.ts) uses IndexedDB; upload interfaces accept `File`/`Blob`; and [multipart playback](../src/services/supabase/multipartMedia.ts) depends on a browser service worker. Native work would need deliberate adapters for storage, auth callbacks, uploads, media playback, and the existing page-interaction API.

[Native platform direction](native-platform-direction.md) records React Native
with Expo as the leading candidate, still unselected and uninstalled. Consider
a monorepo when native implementation begins; keep the current layout now.
Portable domain logic, types, and contracts can be shared while each client
keeps its appropriate presentation. This task adds no native app or backend.

Follow [AGENTS.md](../AGENTS.md) for platform scope and safeguards, and [development workflow](development-workflow.md) for collaboration and verification. The historical [WEB/MOBILE report](web-mobile-architecture.md) records the initial extraction and its checks; its old test counts and deployment observations are dated evidence.
