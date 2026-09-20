# WEB / MOBILE presentation architecture

Document 04 implementation, 2026-09-09. This is the minimum presentation boundary identified by the repository audit. It is implemented and checked locally; no production deployment was performed.

## Boundary and selection

`AppPresentation.tsx` owns the stable presentation boundary. `AppPresentationProvider` wraps `AppContent` so its root appearance controller can consume the same context as its descendants. `AppPresentation` renders the single root `div`, retains its attributes and children, and adds `data-presentation="web"` or `data-presentation="mobile"`. Neither component is keyed by presentation and there is no extra DOM wrapper. The existing navigation, workspace, screen layers and dialogs stay in their original positions.

One `useViewportPresentation` subscription chooses MOBILE when `(max-width: 639px)` matches and WEB otherwise. This reuses the compact-navigation breakpoint already present in Portalink. Without a browser or `matchMedia`, the fallback is WEB. A narrow desktop window can therefore use MOBILE; a wide phone/tablet can use WEB. There is no device-brand, installation, touch, route or account detection. The 390px and 430px QA sizes are samples, not additional product boundaries.

Descendants consume `usePresentation()` instead of starting their own presentation selector. `useCompactNavigation` now consumes that context while preserving its existing expansion behavior, route-change reset and separately stored desktop collapse preference. Both the normal and public-profile sidebars already use this hook.

The host is intentionally stable across presentation changes: no platform key, alternative root component or duplicated feature tree. App's controllers and screen-transition keys remain independent of presentation. This allows an open draft dialog to survive a viewport change and avoids recreating the application merely to change its frame.

## Shared and platform-specific responsibilities

| Responsibility | Implementation |
| --- | --- |
| Authentication, accounts, services, APIs, permissions and models | Existing shared implementation, unchanged. |
| Application providers, route resolution, deep links and screen-transition state | Existing shared implementation, unchanged. |
| Projects, profiles, messages, uploads, engagement and their controllers | Existing shared features; no WEB/MOBILE copies. |
| Appearance tokens, semantic colors, common controls and feature styling | Shared rendering; personal appearance choices are stored independently for WEB and MOBILE. Existing responsive feature rules remain in place. |
| Workspace inset, frame border/radius and shadow | Explicit scoped rules in `presentation/web/web.css` and `presentation/mobile/mobile.css`. |
| Compact navigation behavior | Existing behavior driven by the single presentation context. |
| Future intentionally divergent features | May consume the context and introduce a local presentation variant while retaining shared data and controllers. No feature-availability decisions were made here. |

The extracted CSS preserves the old values. WEB retains its inset, border, rounded workspace and shadow; MOBILE retains its existing flush frame. Every new selector is guarded by the root presentation attribute. `:where(...)` adds no specificity, preserving the old cascade strength. Both files load together, but only the matching selectors apply. This is presentation isolation, not a separate application or separate build.

### Independent personal appearance (2026-09-19)

`useDeviceAppearance(presentation)` keeps two stable preference slots, saved as `portalinknetworks.interfaceAppearance.web` and `.mobile`. Each contains System/Light/Dark mode, accent colour, system grey, high contrast and reduced translucency. Existing legacy browser choices seed both slots once; future changes persist only the affected slot. Switching the presentation restores its settings without remounting the app or resetting a draft. Blocked storage keeps session choices; storage events update the corresponding platform slot. OS colour-scheme events still resolve each slot's System mode. These are browser-local settings, not account-synced or device-brand detection.

Public website branding remains a separate, shared profile record. Explicit accent/grey choices retain the existing public-branding save path, but loading/changing that branding no longer overwrites either personal palette. Opening settings or changing theme does not silently save a palette variant. Unsaved profiles start from the active saved personal palette; existing profile branding wins when present. Shared-link light/dark overrides are also separated by platform (`portalink.publicTheme.<profileId>.<presentation>`), with unchanged legacy values as the initial fallback. The initial HTML uses the same 639px boundary and preference records to prevent an opposite-theme startup flash. No backend schema or auth changes are needed.

WEB remains the protected reference experience. MOBILE now has an independently editable presentation boundary and stylesheet. Its initial UI is Portalink's existing compact layout, not a completed mobile design.

## Files

Created in this stage:

- `src/presentation/AppPresentation.tsx` — stable host, context and presentation stylesheet imports.
- `src/presentation/usePresentation.ts` — shared presentation type/context consumer.
- `src/presentation/useViewportPresentation.ts` — one viewport selection hook.
- `src/presentation/web/web.css` — existing WEB frame rules, scoped.
- `src/presentation/mobile/mobile.css` — existing compact frame rules, scoped.
- `tests/presentation-boundary.test.mjs` — selector, lifecycle, host structure, CSS isolation and application-boundary checks.
- `docs/web-mobile-architecture.md` — this implementation and verification report.

Modified in this stage:

- `src/App.tsx` — root host extraction only; existing contents and token props preserved.
- `src/hooks/useCompactNavigation.ts` — consume the shared presentation context instead of its own media-query subscription.
- `src/index.css` — move only the two frame selectors and their compact overrides to the platform files.
- `tests/ui-consistency.test.mjs` — exercise compact navigation across both presentation states and both initial desktop collapse preferences.
- `AGENTS.md` — record the implemented boundary alongside the adopted operating rules.
- `docs/dual-view-development.md` — update architecture/verification status while retaining the original setup evidence.

The pre-existing `index.html` title edit and codebase audit were preserved. No package, dependency, routing, backend, environment, PWA or service-worker changes were needed. Account deletion remains hard-disabled.

## Verification

Implementation proceeded in two steps: stable host extraction with WEB comparison/typecheck, then the shared selector and scoped frame CSS with the checks below.

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed before and after the architecture changes. |
| `npm.cmd run lint` | 0 errors, 86 existing warnings before and after. |
| `npm.cmd run build` | Passed client and worker builds. Large-chunk warnings remain. |
| Focused Node tests: presentation boundary, UI consistency, public sidebar and dialog viewport | 23 passed. |
| Full Node suite | Baseline: 198 passed, 1 failed. Final: 204 passed, 1 failed (205 total). Same pre-existing failure, described below. |
| Independent source review | No actionable regression found in host/state continuity or the frame CSS extraction. |

The existing failing assertion is in `tests/shared-header-alignment.test.mjs:106`, in “public sidebar has no stray top inset and details header stays anchored during scrolling.” It expects `padding-top: '0'` on the selector it queries and receives `undefined`. The failure was reproduced before implementation. This stage did not change the shared-header rule or repair unrelated styling/test expectations.

The Sites build helper could not locate its npm launcher files in this Windows environment. The repository's existing `npm.cmd run build` then completed successfully. No deployment followed.

Browser checks against the existing connected local server:

- Compared the WEB root, navigation, workspace, viewport, main content and profile-information frame before/after the first extraction. Geometry and sampled computed styles matched. After the selector/CSS extraction and reload, the five shell/main samples matched again; profile data was still loading at that instant.
- Entered an unsaved profile-name draft, moved from WEB to 390px, to 430px, and back to WEB. The draft remained, there was one dialog throughout, and the main sidebar returned from 48px to its 266px desktop width. Cancelled the draft without saving.
- Applied distinct temporary one-pixel outline rules to the WEB and MOBILE stylesheets. WEB displayed only its rule; 390px/430px displayed only the MOBILE rule. Removed both probes afterward and verified no outline remained.
- Opened the existing five-page “I'm feeling font” project through its normal canonical project route. Verified the PDF pages at WEB and 430px, then returned to the profile.
- Opened the canonical public `/share/:profileId` route at WEB and 430px. The same profile/content loaded, the public sidebar changed from 280px to 48px, and no Edit profile action appeared. Browser Back and Forward returned to the expected personal/public routes.
- Opened Messages at WEB and 390px; the Messages heading and route remained correct and the compact sidebar was 48px. No messages were sent.
- Restored the desktop viewport and original profile route after verification.

These are actual sequential checks in one connected browser. Independent simultaneous WEB/phone automation has not been established. Public-route checks used the current session and do not establish signed-out permission isolation. No live upload, password reset, account deletion or other destructive flow was exercised. Physical phones, software keyboards, standalone PWA behavior, active media playback and in-flight upload preservation were not tested.

During migration, editing the module graph and hook signature triggered transient HMR/import errors in the already mounted preview. A full reload resolved those errors. Subsequent route checks exposed a React warning about `fetchPriority` in the existing `ResponsiveImage` component; this is not a clean-console claim. No recurring presentation/hook crash was observed after the reload.

Live profile data and appearance refreshed during the longer comparison session. Therefore the frame measurements and unchanged CSS establish the scoped preservation claim; screenshots taken across that data/theme refresh are not claimed to be a pixel-identical full-product regression result. The project-filter retention attempt was inconclusive because the compact project index hides that input; no filter-state claim is made.

## Remaining architecture limits

- Most feature CSS is still shared. Future platform-only edits must scope the relevant selector or introduce a feature presentation boundary; merely editing a shared file does not guarantee isolation.
- Body-portalled menus do not inherit the app root's DOM attribute. React context still crosses portals, but future platform-specific portal styling needs a marker on that portal surface or another explicit scope. The existing shared portal styling is unchanged.
- Existing feature breakpoints (including messaging and project-panel allocation) remain their own layout rules. This stage does not reinterpret them as a final tablet/mobile product policy.
- The stable root protects existing children across breakpoint changes. A future implementation that switches entire component types can still discard state local to those components; keep such controllers above the divergent presentation where necessary.
- The existing header test failure, lint warnings, large bundles and image-prop warning remain separate debt. They were not used as a reason to broaden this infrastructure stage.

This completes the Document 04 infrastructure stage. Further mobile navigation, touch behavior or visual design should be a separately scoped user request.
