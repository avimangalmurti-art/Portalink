# portalinknetworks — Frontend Handoff

## 1. What this repository is

This is the **reference frontend implementation** for portalinknetworks: a creator
portfolio and discovery product (profiles, portfolios, project viewers,
discovery feed, Portalink locations, Studio analytics, settings).

Design owns the interface and interaction behaviour in this repo. Engineering's
job is to **replace mocked infrastructure with production services**, not to
rebuild the UI. Every screen, label, flow, and state here is intentional.

There is **no backend**. Nothing here talks to a network.

---

## 2. Architecture

```
App.tsx                     Application shell: providers, appearance, current
                            destination, back-stack, top-level overlays
app/routes.ts               Route map (stable ids → path templates)
components/ui/              Design-system primitives (Button, IconButton,
                            StateViews: Empty/Loading/Error/InlineStatus)
design-system/tokens.ts     Typed index of semantic tokens + non-colour scales
components/                 Product screens and feature components
  home/  profile/  studio/  settings/
features/                   Feature-level logic (e.g. follows/useFollows.ts,
                            follows/FollowButton.tsx)
services/interfaces.ts      THE ENGINEERING BOUNDARY — every service contract
services/mocks/index.ts     Mock implementations (prototype data, no fake DB)
services/index.ts           The registry: swap implementations here
contexts/ServicesContext.tsx  Injection point; components call useServices()
types/domain.ts             Domain models
hooks/                      Reusable hooks (useAsyncAction, useElementSize)
data/                       Prototype/sample data, separate from components
utils/                      Pure helpers (appearance persistence, Studio query)
index.css                   Semantic token definitions, light + dark
```

Two token families exist by design: the product tokens (`--surface-*`,
`--text-*`, `--accent-color`) and the Studio tokens (`--studio-*`), which give
the analytics workspace its own tonal scale while resolving the same roles.

---

## 3. Presentation to preserve

These surfaces are considered finished at the presentation layer. Change them
only for accessibility, responsive, or state-coverage reasons:

- **Sidebar** — nav tiles, PORTFOLIO section, drag-to-reorder categories,
  collapsed rail, selection treatment (tinted surface + inset accent bar).
- **Home feed** — featured project, accounts to explore, content-driven masonry
  where aspect ratio comes from the canonical record's own cover proportions
  (`utils/projectPresentation.ts`).
- **Profile + category pages** — index column, category formats (grid, gallery,
  story, feed, video, audio, data), owner vs visitor tool visibility.
- **Project viewers** — `PdfViewer` (zoom, page metrics, tools popover),
  `AudioPlayer` + `Waveform` (waveform is the hero; semantic colour layers for
  played / playhead / gaze / anomaly), content inspector overlay.
- **Portalink** — globe cartography, city grid, location pages.

### Location / planet system

Every city in the browse grid renders through **one** component,
`components/portalink/CityPlanet.tsx`. Do not hand-style individual planets.

- **Contract** — `city: CityPlanetData` (`id`, `name`, `countryCode?`,
  `latitude`, `longitude`), plus `isSelected?`, `disabled?`, and `onSelect`.
  Navigation and selection are externally controlled; only hover/focus
  activation and the running clock are local state.
- **States** — neutral → activation (hover **or** keyboard focus, resolved
  identically) → geographic reveal → pressed → navigate, with `focus-visible`,
  `aria-current`, and `disabled` handled in `index.css`
  (`[data-portalink-tile]`).
- **Geographic reveal** — coordinates and the UTC offset occupy a reserved
  two-line slot (`h-8`) that is always present, so activation never shifts
  neighbouring planets at any breakpoint. Both values are exposed to keyboard and
  screen-reader users through the button's accessible name, never hover-only.
- **Real values only** — coordinates come from `data/cities.ts`. The UTC label is
  produced by `formatSolarUtcOffset` in `utils/location.ts` from the same
  longitude the product's clocks (`getLocalTimeAt`) already use; there is no
  timezone database, so `Location.timeZone` stays empty and any value that cannot
  be derived is omitted rather than invented.
- **City accents** — `data/cityAccents.ts` maps a location id to one of the
  `--location-accent-1..8` tokens and exposes it as `--city-accent`,
  `--city-accent-soft`, and `--city-accent-strong`. The component consumes only
  those three semantic values. Location accents are identity, and are kept
  entirely separate from `--status-*` and focus colours.
- **Motion** — durations come from `design-system/tokens.ts`
  (`motion.duration.control` / `.panel`). Globe rotation is suppressed under
  `prefers-reduced-motion` inside `CityGlobe`, while the accent marker and the
  geographic reveal still resolve.
- **Ids** — `toLocationId()` in `utils/location.ts` is the single source of
  location ids, shared by the browse grid and `MockLiveService.listLocations`.

### Globe geography and semantic zoom

- **The globe is a precise navigation instrument.** It draws exactly one thing:
  a tiny bright-orange dot with a thin dark border per *reachable* destination.
  There is no background density layer, no clustering, and no permanent labels —
  if something is on the sphere, it can be entered.
- **Identity on demand** — a city's name renders only while its dot is hovered or
  keyboard-focused, so at most one label exists at a time and no label pass or
  collision budget is needed.
- **Semantic zoom** — `GeoCamera.scale` (1 = whole planet, up to 8) resolves a
  `GeographicLod` of `global | continental | regional | local` in
  `utils/geoScene.ts`. Thresholds live only in that resolver; no component
  compares zoom values. LOD is geographic, not responsive; it modulates dot
  radius only. Viewport size is a separate, legibility-only input: `hitRadius` is
  sized in real CSS pixels (~22px) so the dot can stay tiny while the target
  stays reachable by pointer and touch.
- **One pipeline** — `resolveScene({ cities, camera, pixelSize })` returns the
  whole frame (`cities`, `dotRadius`, `hitRadius`) and takes no interaction state,
  so hover/focus never recomputes geography.
- **Data boundary** — records enter at `data/geography.ts`, minted *only* there
  from `data/cities.ts`. `GeographyService` (`services/interfaces.ts`) is the
  boundary: `readLocalGeography()` is the synchronous local path the prototype
  renders from, and `getVisibleGeography(bounds, lod)` is the shape a spatial API
  or vector-tile source should implement. The `PopulatedPlace` type is retained to
  keep *geographic existence ≠ product destination* expressible, but no
  non-navigable geography is shipped or drawn today.
- **Destination boundary** — `NavigableCity.destinationId` maps to the existing
  product city via `toCityDestination()`. The renderer never routes: it calls
  `onActivate(city)` and `PortalinkPage` opens the same destination it always did.
- **Rendering and accessibility boundary** — back-facing and off-disc geography is
  culled before render, so nothing invisible is mounted or focusable. Each visible
  dot is one transparent `role="button"` circle with the city's accessible name;
  the drawn dot is `aria-hidden`. Enter/Space activate, and pointer-down is not
  captured, so rotating the globe never opens a city.
- **Tokens** — `--geo-city-dot`, `--geo-city-dot-border`, `--geo-label-primary`,
  `--geo-label-halo`, `--geo-line-subtle` in `index.css`. Marker appearance lives
  in `components/portalink/GeoMarker.tsx` only.
- **Scaling path** — to grow the dataset, replace `localGeographyService` with an
  implementation of `GeographyService` that answers per-bounds/LOD (static shards,
  a spatial service, or tiles). If a future scale genuinely needs aggregation or a
  cheap background layer, they belong in the resolver and a batched primitive
  respectively — the marker grammar, LOD bands, accessibility model, and
  navigation contract stay as they are.
- **Studio** — KPI strip, unified analytics workspace (visualization stage +
  Content retention list), AI Studio panel (composer, For You, Explore, transcript, follow-ups),
  contextual generative actions.

### Studio analytics ownership

- **The four KPI cards are the only primary-metric selector.** Each is a real
  `button` with `aria-pressed`; its action and its selected state both resolve
  from `kpiStageView` / `isKpiActive` in `utils/studioQuery.ts`. The chart's
  separate Metric dropdown was removed — do not reintroduce a second selector.
- **`view: StageView` in `PlatformAIPage` is the single selected-metric state.**
  The selected card, chart title, series, formatting, and AI follow-ups are all
  derived from it; nothing is stored twice.
- **Reporting period** — `periodId: ReportingPeriodId` in `PlatformAIPage` is the
  single period state, changed only by the header filter (Day / Week / Month /
  90 days, defined once in `reportingPeriods`). KPI values, deltas,
  and the time-series stage all derive from it via `kpisForPeriod` and
  `timeSeriesForPeriod`; no component stores a second period, and charts never
  restate the window. The measured week is the baseline — other windows are
  resampled from that same curve (each bucket totals its own span), and metrics
  are tagged `window` (accumulates: Gaze Time, Profile views) or `snapshot` (a
  rate or running total, not scaled: Engagement, Audience — though Audience's
  `+164` arrivals do scale). `AnalyticsService.getCreatorAnalytics(profileId,
  periodId)` takes the window as a query parameter, so a real backend filters
  server-side instead of the client re-deriving.
- **Responsibility split** — the KPI card owns the current value and trend only;
  it carries no sparkline, because day-to-day movement is exactly what the
  visualization it selects is for. The chart owns temporal behaviour. Chart hover, keyboard focus, per-point
  labels, and the tooltip are unchanged; the permanent "hover or focus a point"
  instruction was removed and its reserved slot kept so nothing shifts.
- **`MetricSelect`** is still used by the ranking and comparison stages (a
  different question: which measure to rank by). It was only removed from the
  time-series header.
- **One mutation path** — every control that changes the stage (KPI cards, the
  stage's own measure selectors, the diagnostics heading) calls `showOnStage` in
  `PlatformAIPage`. Do not set `view` from a component's own handler.
- **`SecondaryMetrics`** (`components/studio/SecondaryMetrics.tsx`) is display
  only: Likes, Saves, Avg. Gaze Session, response rate, plays, library. It is
  deliberately not wired to the stage.
- **Content retention** (`components/studio/ContentRetention.tsx`, formerly
  `RetentionDiagnostics`) was renamed and re-placed, not functionally changed:
  same entries, percentages, signals, processing states, and selection
  behaviour. Its heading remains a selectable control that puts retention on the
  stage, using the same `aria-pressed` + leading-bar + dot grammar as the KPI
  cards.
- **One workspace, master-detail.** The stage and Content retention share a
  single bordered surface split ~69/32 and divided by a hairline (stacking below
  `lg`). The page header, KPI strip, and that surface fill the viewport, so
  desktop does not page-scroll: the workspace is `flex-1`, and only the content
  list scrolls internally. Charts measure their own box via
  `hooks/useElementSize` and use a 1:1 viewBox, so they grow into the available
  height without distorting strokes or points.
- **Adaptive emphasis (three layers).** Nothing is hidden or disabled to create
  focus; emphasis is redistributed. `isInspecting` (`view.kind === 'retention'`)
  in `PlatformAIPage` drops the KPI strip, the supporting metrics, and the period
  control to context opacity, and every recessed region returns to full contrast
  on hover or `focus-within`, so it is always readable and operable. Unselected
  KPI cards and unhovered content rows rest below full contrast for the same
  reason. Never use blur for this, and never take inactive content below a
  readable contrast.
- **Progressive disclosure in content rows.** At rest a row is icon + title +
  value; the retention bar, signal label, and metadata appear on hover, focus, or
  selection. When the stage is already ranking retention
  (`view.kind === 'ranking' && metric === 'depth'`), the panel drops its
  percentages entirely — the same figure is never printed in two regions of one
  view.
- **One accent at a time.** The selected KPI owns the stage's accent: Gaze
  purple, Profile views blue, Engagement coral (`--studio-coral`), Audience rose.
  Status colours (green strong, amber diagnostic, yellow pending, neutral stable)
  are semantic and never used to signal what is selected.
- **Weekly overview** appears in the stage header while a piece's curve is
  shown. `metricViewRef` in `PlatformAIPage` remembers the last time-series view,
  so returning restores the selected KPI rather than a hardcoded default. It is
  navigation within the workspace — no modal, no new destination.
- **Control Center / settings** — appearance, accent, contrast, translucency.

---

## 4. What is mocked

| Area | Current implementation |
| --- | --- |
| Auth | `services/prototype/authService.ts` — in-memory accounts, **no tokens, no persistence, no network, no email**. Starts signed out. Replace with `SupabaseAuthService` implementing `AuthService`. |

| Profiles | Read from `data/profiles.ts`. `updateProfile` merges and returns; it does not persist. |
| Profile creation (onboarding) | `createProfile` builds a real `Profile`, registers it in memory via `registerPrototypeProfile`, and maps it to the account id. **Lost on reload — no database.** |
| Handle availability | Checked against local fixture handles only. **Not authoritative**: real uniqueness is a Postgres unique constraint on `profiles.handle`, and `createProfile` re-checks and can still throw `handle_taken`. |
| Avatar | Chosen file is validated and previewed from an object URL. **Never uploaded**; `avatarPersisted` is always false and the UI says so. Swap in Supabase Storage behind `ProfileService.createProfile`. |
| Projects | Read from the same file. Arrangement (order / hidden) lives in component state. |
| Uploads | `uploadProjectMedia` **rejects** — no media storage. The UI shows a truthful error. |
| Discovery feed | `data/feed.ts` holds CURATION IDS ONLY. `mockDiscoveryService` resolves each id to a canonical `Project` (plus its owning profile) through the same read path as `ProjectService`, so discovery can never disagree with a profile about the same work. Newly published work leads the run. |
| Search | Client-side substring match over profiles, projects, and cities. |
| Follows | In-memory, per authenticated account, session only, via `mockSocialService`. |
| Comments | In-memory comment graph, session only, via `mockCommentService`. Author identity resolved from the canonical profile on every read. |
| Activity / notifications | Return empty arrays. Activity views render empty states. The platform records likes, reposts, and bookmarks only — there is no comment or share feature. |
| Live sessions | `listSessions` returns empty; join/leave resolve. Live UI is presentational. |
| Analytics | Fixed figures in `data/studioAnalytics.ts`. AI Studio answers come from `utils/studioQuery.ts` — a deterministic interpreter, not a model. |
| Studio generative actions | Resolve after a delay so success states are reachable. Nothing is generated. |
| Commerce | `getProduct` returns a stub; product detail is presentational. |
| Appearance preferences | **Genuinely local by design** — `localStorage`, via `localPreferencesService`. |

### Attachments and media rendering

A project is an ordered collection of typed attachments (`ProjectAttachment` in
`types/domain.ts`). **The category never decides how a file is presented.** A GLB
inside a music category renders as a 3D model; a PDF inside a photography
category renders as a document.

- `features/publishing/assetTypes.ts` is the single classifier. `detectAsset`
  resolves family + capability from extension (MIME as fallback), and
  `mediaKindFor` maps that to the renderer kind — `image | video | audio |
  document | model3d | unknown`. Nothing else may infer a renderer.
- `features/media/projectAttachments.ts` converts prepared uploads into
  attachments and synthesizes ONE legacy attachment for seeded records that have
  no files. That fallback is the only place a category format implies a kind,
  and only because there is no file to ask.
- `components/media/AttachmentRenderer.tsx` switches on `kind` and delegates.
  `ProjectMediaViewer` renders the active attachment plus a switcher when a
  project holds more than one. Adding a renderer means adding a case here.
- `sourceUrl` is a local object URL in the prototype; `storagePath` stays `null`
  until something is actually stored, so a preview can never be mistaken for
  persistence. Every renderer has loading / ready / failure states, and a failed
  file never collapses the page.

---

## 5. Backend connection points

Replace these in `services/index.ts`. One line each; no component changes.

```ts
export const services: Services = {
  auth:          new SupabaseAuthService(supabase),   // the ONLY identity source
  profiles:      new ApiProfileService(http),         // profile read + write
  projects:      new ApiProjectService(http, storage),// projects + media upload
  discovery:     new ApiDiscoveryService(http),       // feed / ranking
  search:        new ApiSearchService(searchIndex),    // real search backend
  social:        new ApiSocialService(http),           // follow graph
  engagement:    new ApiEngagementService(http),        // likes/saves/reposts
  notifications: new ApiNotificationService(http),
  live:          new ApiLiveService(realtime),          // sessions / presence
  analytics:     new ApiAnalyticsService(http),         // metrics + AI jobs
  commerce:      new ApiCommerceService(http),
  preferences:   localPreferencesService               // keep local
};
```

Contracts are in `services/interfaces.ts`. Every method is async, takes and
returns domain models, and is keyed by stable ids.

---

## 6. Route map

The browser URL is the canonical navigation state. `react-router-dom`'s
`BrowserRouter` wraps the app in `index.tsx`; `app/useAppRoute.ts` parses the
current location against `app/routes.ts` into a typed `AppRoute`, and
`useRouteNavigator()` builds every navigation from the same templates. `App.tsx`
derives which surface is open from that route and keeps React state only for
transient things (dialogs, forms, splash, pending resolutions). Back and Forward
are the browser's; there is no internal history array.

| Route id | Path | Params |
| --- | --- | --- |
| `home` | `/` | — |
| `destination` | `/feed/:destinationSlug` | `destinationSlug` |
| `discovery` | `/discover` | — |
| `search` | `/search` | `q` |
| `profile` | `/p/:profileId` | `profileId` |
| `profileCategory` | `/p/:profileId/c/:categoryId` | + `categoryId` |
| `project` | `/p/:profileId/c/:categoryId/:projectId` | + `projectId` |
| `productDetail` | `/item/:productId` | `productId` |
| `portalink` | `/portalink` | — |
| `location` | `/portalink/:locationId` | `locationId` |
| `studio` | `/studio` | — |
| `messages` | `/messages` | — |
| `settings` | `/settings` | — |
| `personalization` | `/settings/appearance` | — |
| `controlCenter` | `/appearance` | — |
| `activity` | `/p/:profileId/activity/:activityKind` | `profileId`, `activityKind` |

Rules that hold across the router:

- **Ids only.** Profile, category, and project routes carry canonical ids. A
  route id is confirmed through its read boundary (`useProfileQuery`,
  `useProjectResolution`) before the surface renders, so an unknown or deleted id
  shows a not-found instead of a substituted record. Editorial destinations are
  the one label-shaped route, because they are curated feeds rather than records,
  and they travel as a slug that must match a declared destination.
- **Public vs protected.** Profiles, categories, and projects are readable signed
  out. `PROTECTED_ROUTE_KINDS` (studio, messages, settings) hands the requested
  path to the auth gate as an `AuthIntent` of kind `route`, so the destination
  survives sign-in and profile onboarding and is continued to afterwards. The URL
  is never rewritten to lose it. Interactions are still never replayed.
- **Not authorization.** Route visibility decides what the interface offers.
  Real access control stays with the services (and later RLS).
- **Screen presets are preview only.** `screenPresetPath()` translates a Magic
  Patterns preset into a canonical path once, at startup; routing is the single
  source of truth from then on.

---

## 7. Domain models

`types/domain.ts` is the source of truth for content: `Profile`,
`PortfolioCategory`, `PortfolioArrangement`, `Project`, `ProjectMedia`,
`ProjectChapter`, `ProjectArrangement`, `ProjectView`, `FeedCurationEntry`,
`FeedCreator`,
`SearchResult`, `FollowState`, `Notification`,
`LiveSession`, `Location`, `Product`, `CreatorAnalytics`,
`AppearancePreferences`, `AsyncStatus`.

The `data/*.ts` files still export their original prototype types; these are
structurally compatible with the domain models and should converge on them as
each service is replaced.

---

## 8. Design tokens

- Values: `index.css` (`:root`, `.theme-dark`) — ~260 custom properties, plus the
  newly added `--surface-inset`, `--status-success`, `--status-warning`,
  `--status-danger`.
- Typed index and scales: `design-system/tokens.ts` — spacing (4/8/12/16/24/32),
  radii (control 8–10, card 12, panel 16), control heights (28–44), icon sizes
  (14–20), type roles, elevation, motion (140–240ms, ease-out).
- Typography: three fluid sizes only (`text-small`, `text-medium`, `text-large`)
  defined in `tailwind.config.js` and enforced in `index.css`. Hierarchy comes
  from weight, colour, and spacing — not from new sizes.

Semantic colour meanings, product-wide: blue/accent = interaction and selection,
purple = attention (Gaze), indigo = AI, green = positive movement, orange =
diagnostic anomaly, yellow = processing/pending, pink = audience affinity, cyan =
audio, red = destructive or genuine failure.

Known debt: some older screens still carry raw hex values in Tailwind arbitrary
classes. Migrate them to tokens opportunistically; do not restyle while doing so.

---

## 9. State expectations

Server-backed actions must express: **initial → in progress → success → failure →
retry**. `hooks/useAsyncAction.ts` provides exactly that (`status`, `error`,
`isLoading`, `run`, `retry`, `reset`), and `components/ui/StateViews.tsx`
provides the shared `EmptyState`, `LoadingState`, `ErrorState`, and
`InlineStatus` presentations.

Reference implementation: `features/follows/useFollows.ts` (owns state, calls
`SocialService`, exposes status/retry) plus `features/follows/FollowButton.tsx`
(pure presentation, no service access).

Required coverage per action:

| Action | States to support |
| --- | --- |
| Follow / unfollow | idle, loading, success, error + retry, disabled while pending |
| Upload work / add document | idle, selecting, uploading (progress), success, error + retry, permission restricted (non-owner) |
| Edit profile | idle, saving, saved, validation error, request error |
| Analytics load | loading, empty ("Not enough viewing data yet"), error + retry |
| Studio generative actions | idle, running, done, error |
| Live session join | idle, joining, joined, error |
| Search | idle, loading, empty results, error |

Non-owner surfaces must render **permission restricted** by omitting owner
controls entirely (as they do today), never by showing a disabled control.

---

## 10. Component contracts

Reusable product components declare their contract in typed props: data in,
state in, callbacks out. Example:

```ts
type FollowButtonProps = {
  profileName: string;
  isFollowing: boolean;
  status?: AsyncStatus;
  disabled?: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onRetry?: () => void;
};
```

Rules:
- Presentational components never import from `data/` or `services/`.
- Feature components resolve services with `useServices()` and pass plain props
  down.
- Transient presentation state (open menus, hover, zoom level) stays local.

---

## 11. Known prototype limitations

- **Auth is frontend-only.** The UX, state machine, and service boundary are
  real; the implementation behind them is a prototype. Hidden owner controls are
  a permission *presentation*, never security — Supabase RLS and server-side
  authorization are still to be built. No account survives a reload, because no
  session is ever persisted.

### Auth architecture

`UI → useAuth() (contexts/AuthContext.tsx) → AuthService (services/interfaces.ts) → implementation`

- **Domain models** live in `types/auth.ts`: `AuthUser`, `AuthSession`,
  `AuthPhase`, `AuthRecoverySession`, the input/result types, and
  `AuthServiceError` / `toAuthError` for UI-safe failures with a branchable
  `code`. No tokens appear in any model.
- **One session source of truth.** `AuthProvider` owns
  `initializing → unauthenticated → authenticating → authenticated → failed →
  signing-out`, subscribes to `onAuthStateChange`, and exposes
  `viewerProfileId`. `LOGGED_IN_PROFILE_ID` is gone: `App.tsx` derives
  `isOwnerMode = viewerProfileId !== null && viewedProfileId === viewerProfileId`,
  so signed out, every profile is a visitor view and owner tools disappear.
- **Guest layer vs authenticated layer.** Signed out, the product is the
  discovery surface: Portalink Earth, city pages, search/browse, the Home feed,
  and an individual content preview. Everything deeper — a creator's profile, a
  portfolio category, My profile, Studio, follows, publishing, profile editing —
  is authenticated continuation.
- **The gate.** `AuthProvider.requestAuthenticatedDestination(intent)` remembers
  an `AuthIntent` (`my-profile`, `view-profile:{id}`, `view-portfolio:{id}`,
  `interaction`) and opens the sign-in sheet with wording from `describeIntent`.
  The intent lives in a ref, deliberately outside render and outside the sheet's
  visual state, so it cannot re-trigger the navigation that opened it.
  `closeAuth` clears it while still signed out (cancel abandons the
  destination) and keeps it once a session exists. `App.tsx` has ONE effect that
  fulfils it the moment identity resolves, via `consumePendingIntent()` — read
  once, then null, so no `profile → sign in → profile` loop is possible. Gating
  lives in `openProfile` / `selectProfileCategory` / `openOwnProfile` /
  `openPlatformAI`, never in cards or presentation components.
- **My profile** always resolves to `auth.viewerProfileId`: signed out it gates,
  verified-without-profile it onboards (and the new id is navigated to on
  completion), otherwise it opens that profile in owner mode.
- **Gated actions** go through `requireAuth(action, label)` in `App.tsx`, which
  opens the auth sheet instead of silently failing.
- **Flows** that do not mutate the session (sign-up, reset request, password
  update) live in `features/auth/useAuthFlows.ts` on top of `useAsyncAction`,
  following the `useFollows` pattern. Forms never import a service.
- **Sign-up never authenticates** while the service reports that verification is
  required, and the reset flow states plainly that no email was delivered.
- **Sign-out** is a service call with confirmation, in-progress, failure, and
  retry states. The old local "You're signed out / Undo" state is removed —
  signing out is never reversible local UI.
- **Typography is not permission state, and not profile state.** `--app-font` is
  set once, on the app root, to the interface face — so every surface, on every
  profile, shares one system face. Creator typography belongs to an individual
  PROJECT, and it is carried on the canonical record as the `design.typefaceId`
  setting. It is read and written through `ProjectService`
  (`getProjectDesign` / `listProjectDesigns` / `updateProjectDesign`) via the
  `useProjectTypography` feature hook — never from component state.
  `data/projectTypefaces.ts` is now only the MIGRATION SEED the prototype service
  reads for seeded work, so those projects keep the exact face they always had.
  Owner edits are session-only and reset on reload. The face is applied only
  through `data-font-preview` elements (the project title in the viewer header
  and each title in the project index). Nothing about typography depends on
  `isOwnerMode`, the auth phase, or the profile being viewed — only on whether
  the viewer authors the project, which gates the inspector alone.
### Account vs profile (onboarding)

An authenticated account and a public creator profile are distinct. An account
may exist with no profile, and a new account is NEVER given a seeded one.

- **Models** — `types/profile.ts`: `ProfileOnboardingStatus`
  (`unknown | not-required | required | ready`), `CreateProfileInput`,
  `HandleAvailability`, `HandleCheckStatus`, `PreparedAvatar`,
  `CreateProfileResult`, and `ProfileServiceError` with branchable codes.
- **Boundary** — creation extends the existing `ProfileService`
  (`getProfileForAccount`, `checkHandleAvailability`, `createProfile`) rather
  than a parallel onboarding data layer. `UpdateProfileInput` now carries the
  same identity fields onboarding collects — including `handle` and a prepared
  `avatar` — and `updateProfile` applies the same normalization and write-time
  handle re-check, so profile editing reuses one model rather than growing a
  second one.
- **Feature hooks** — `features/profile/useProfileOnboarding.ts` owns status
  derivation, the debounced handle check (idle → checking → available /
  unavailable / error, with retry), avatar preparation, and submission via
  `useAsyncAction`. `features/profile/validation.ts` owns `normalizeHandle` and
  the field rules, and is shared by the form AND the service.
- **Editing** — `features/profile/useProfileEditor.ts` reuses the same
  validation module, handle hook, avatar preparation, and `ProfileService`. It
  adds dirty detection, an unsaved-changes confirmation, and a save lifecycle;
  an unchanged handle is never re-checked or reported unavailable. Entry is
  owner-only and derives from `auth.viewerProfileId === viewedProfileId`.
### Publishing & media

- **Boundary** — `UI → features/publishing/* → ProjectService (drafts, publish) +
  MediaService (transport) → implementation`. `types/publishing.ts` keeps the
  browser `File` out of `Project`: `PreparedMedia` is transient, `Project` is
  persisted.
- **Media** — `useMediaPreparation` owns choose/validate/preview/replace/remove
  and every object URL. It reads `MediaService.getUploadCapability()`, which
  today reports uploading as unavailable, so the UI never shows progress or
  claims an upload. `MediaService` already declares `uploadMedia` (with a
  progress callback), `cancelUpload`, and `deleteMedia` for a future
  `SupabaseMediaService`; registering one is a single line in `services/index.ts`
  and the same UI gains uploading, retry, and cancellation.
- **A project is a mixed-media collection, not a format.** A creator may put
  images, a PDF, a 3D model, and a video in the same project. What each file IS
  comes from `features/publishing/assetTypes.ts`: one registry mapping extension
  → `AssetFamily`, human label, size limit, and `AssetPreviewCapability`
  (`native` | `converted` | `preview-only` | `source-only`). Nothing asks the
  creator to choose a type, and the original upload is always preserved.
  Adding a renderer later means adding rows there, not changing publishing.
- **Asset record** — each prepared asset carries family, type label, capability,
  `processingState`, `order`, `isCover`, and `displayTitle`, so the future
  project viewer can pick a renderer per asset. `conversion-required`,
  `preview-limited`, and `preview-unavailable` are real prototype states;
  `uploading`, `processing`, `upload-failed`, and `processing-failed` are declared
  for the future service and must never be simulated.
- **Processing is a separate stage from transport.** `MediaService` carries
  `getProcessingCapability()`, `getProcessingStatus(objectIds)`, and
  `retryProcessing(objectId)`, all keyed by the stable `PersistedMedia.objectId`
  and free of vendor concepts (no bucket, queue, worker, or URL template).
  `upload-failed` and `processing-failed` are deliberately distinct: bytes not
  reaching storage needs the file sent again, whereas a stored object whose job
  failed needs only that job re-run — `retryProcessing` uploads nothing.
  `features/media/useAssetProcessing.ts` is the state machine
  (`processing → ready`, `processing-failed → retry → processing → ready`) with
  stale-response protection, so a query for one project cannot write into another.
  Two invariants: a state changes ONLY because the service reported it (no timer
  advances `processing` to `ready`, and any polling cadence comes from the
  implementation's own `refreshIntervalSeconds`), and when an asset becomes ready
  the hook calls `invalidateProfiles()` so the finished preview arrives through the
  canonical read — no screen architecture is rebuilt. A project may exist while an
  attachment is still processing: `AttachmentRenderer` renders `ProcessingNotice`
  instead of a viewer, stating that the file is stored and its preview does not
  exist yet rather than showing an empty frame. The mock reports processing
  unavailable with its reason, returns no statuses (nothing is stored, so nothing
  can be reported ready), and refuses `retryProcessing` — it simulates no
  conversions, thumbnails, CAD rendering, PDF rasterisation, or progress.
- **Cover** — suggested automatically from the first asset that can be shown,
  overridable via Set as cover. PDFs, video, and 3D are cover-eligible so a
  generated poster frame can fill that slot once a processing service exists.
- **Session publish** — `publishProject` writes into the canonical in-memory
  profile via `registerPrototypeProject` and the feature calls
  `invalidateProfiles()`, so the project appears in its category through the
  normal read path. `PublishResult.mediaPersisted` is always false and the
  project carries `sessionOnly: true`; `cover` is a local blob preview, never a
  storage URL. Reload discards it.
- **Testing publish failure** — publishing a project titled `publish fail`
  always rejects, so the failure/retry path can be exercised. Prototype-only;
  delete with the mocks.
- **Testing the failure path** — the prototype service has no backend that can
  fail, so saving the handle `savefail` always rejects with a network-style
  error (the editor stays open, edits are preserved, retry is offered). Delete
  it with the mocks.
- **Profile reads** — `UI → useProfileQuery → ProfileService → implementation`.
  `contexts/ProfileDataContext.tsx` is the single read boundary and calls
  `ProfileService.getProfile` only; it does not import `data/profiles`, and the
  seed store is reachable **only** from the mock service. Two invariants:
  1. **No substitution.** While a profile is loading, missing, or failed, the
     query answers `null` plus a status (`loading` / `not-found` / `error` with
     `retry`). There is no fallback id anywhere in the read path — the old
     `viewerProfileId ?? 'avi'` in `App.tsx` is gone, so a guest with no creator
     context legitimately has NO profile and the sidebar's portfolio section is
     absent rather than showing a seeded creator.
  2. **One record per id.** The `Profile` the service returned is used as-is; an
     id is never resolved and then re-read from a seed store. A test service
     returning a profile that exists nowhere in `data/profiles.ts` renders
     exactly as returned.
  Rapid navigation is safe: each read carries the id it was made for and only the
  newest settles. Re-reading the SAME id after an invalidation keeps the record on
  screen (same creator, not a substitution); a different id clears it first.
  `updateProfile` writes the canonical record, then the feature calls
  `invalidateProfiles()` once — it empties the cache and every query re-reads.
  Called after profile create/edit (`useProfileEditor`), category mutations
  (`useCategoryManagement`), and publishing (`usePublishProject`). In production
  `fetchProfile` becomes a cached query and `invalidateProfiles` becomes cache
  invalidation; components stay unchanged. Logic that cannot await uses
  `peekProfile(id)`, which returns the already-confirmed record or null — never a
  substitute.
- **Domain types** — production-facing components import `Profile`,
  `PortfolioCategory`, and `Project` from `types/domain.ts`. `data/profiles.ts`
  still declares structurally identical copies, but only the mock service reads
  them; no component imports types from it.
- **Linking** — `AuthService.attachProfile(profileId)` is called only after
  creation succeeds, through `useAuth().linkProfile`. In production the profile
  row references the auth user and the session is re-read.
- **Routing** — `openOwnProfile()` and `openPlatformAI()` in `App.tsx` send a
  verified, profile-less account into onboarding instead of rendering an empty
  profile, and the auth-intent effect does the same when a gated destination
  resolves. Guest discovery is never gated.
- **Reviewing it** — sign in as `new@portalinc.dev` (same prototype password):
  verified, and deliberately owns no profile.
- **No second identity source.** The former `SessionService` / `mockSessionService`
  / `MOCK_VIEWER_PROFILE_ID` / `Viewer` layer is deleted. Content mocks serve
  content only; nothing but `AuthService` can say who is signed in.
- **One account surface.** There are now exactly two settings systems, with no
  overlap: **Control Center** (`/appearance`) configures this browser and needs no
  account, and the routed **Account Settings** page owns everything authenticated —
  General, Personalization, Security, and the account lifecycle (logout, deletion).
  The old `components/AccountDialogs.tsx` modal, which duplicated the settings nav
  and the appearance controls inside the sidebar, is deleted along with its
  `activeAccountDialog` state and its `.settings-dialog` CSS. Its shared
  `AppearanceTheme` type now lives in `utils/appearancePreferences.ts` beside the
  other appearance types. Every settings entry in the sidebar navigates through
  `onAccountPageOpen` → `nav.settings(view)`; nothing opens a local settings dialog.
- **Account Settings views are routes**: `/settings` (General),
  `/settings/appearance` (Personalization), `/settings/security` (Security). All
  three are protected, so a pasted URL preserves the destination through sign-in
  and onboarding.
- **Account security** — `features/auth/useAccountSecurity.ts` is the boundary;
  the Security page holds no service calls. `AuthService` gained
  `getAccountSecurityCapability()`, `getAccountSecurityState()`,
  `changePassword()`, `requestEmailChange()`, and `resendVerification()`, all
  returning typed results rather than `Promise<void>` so the UI can distinguish
  completed / accepted-pending-verification / delivered / unavailable /
  unsupported. Two invariants a Supabase implementation must keep:
  1. **The confirmed email is never moved optimistically.** An email change that
     needs confirmation resolves `status: 'pending'`; the authoritative address
     stays put and the pending one is shown separately. Only the session (or a
     re-read of the security state) may replace it.
  2. **Delivery is never assumed.** `resendVerification` may answer `'sent'` only
     if mail genuinely left. The prototype answers `'unavailable'` with its reason
     — there are no fake timers and nothing says "check your inbox".
  The current password is verified inside `changePassword` (branchable
  `invalid_credentials` / `weak_password` / `same_password` /
  `reauthentication_required` / `rate_limited`); the form checks format and
  matching only and never implies it validated a credential. Sensitive fields
  clear on confirmed success and are never echoed back. The prototype does really
  change its in-memory password so the flow is reviewable end to end, while still
  holding no tokens, no persistence, no network, and no mail.
- **Account deletion** — behind an explicit capability, exactly like uploads.
  `AuthService.getAccountDeletionCapability()` reports whether deletion is
  possible and returns the sentences describing what it removes; the UI lists
  only what it is told. `AuthService.deleteAccount({ accountId, confirmation })`
  performs it, and the prototype throws `deletion_unavailable` rather than
  faking success. A Supabase implementation must re-authenticate, delete the
  auth user with its owned rows and storage objects server-side (service-role
  or an RPC — never from the browser), and end the session. The confirmation is
  re-checked in the service, not trusted from the form.
- **Swapping in Supabase**: implement `AuthService`, change the single `auth:`
  entry in `services/index.ts`. No presentation component changes.
- No persistence beyond appearance preferences. Reordering, hiding, follows, and
  uploads reset on reload.
- AI Studio is a deterministic keyword interpreter (`utils/studioQuery.ts`), not
  a model. Every reply maps to data already in the repo; nothing is invented.
- Analytics figures are fixed and not time-based; "Last 7 days" is a label.
- Media is placeholder geometry, not real assets. Page counts and durations are
  derived deterministically from titles/ids.
- Live sessions, notifications, and commerce are presentational.
- Navigation has no URLs, so refresh and browser back/forward do not restore a
  destination; the in-app back control uses the snapshot stack.
- Screens is a Magic Patterns preview concern (`canvas.manifest.js`,
  `useScreenInit.js`); it is not product code.
