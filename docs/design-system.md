# Portalink interface design system

The reference is the Codex desktop interface directly observed on November 21,
2026: a narrow icon rail, grouped text navigation, warm charcoal sidebar, darker
workspace, subtle boundaries, compact typography and restrained controls.

`src/presentation/design-system.css` owns the shared palette, semantic aliases,
type scale, interface corners, primary actions and panel finish. Desktop
navigation is in `src/presentation/web/desktop-navigation.css`; phone adaptation
is in `src/presentation/mobile/mobile-design-system.css`. All are loaded by the
existing stable `AppPresentation` host. The 639px presentation boundary remains.

- Dark surfaces: canvas `#191919`, sidebar `#201f1d`, panel `#222222`.
- Light mode provides the corresponding white canvas and neutral sidebar.
- Interface actions, fields and rows use 8px corners; panels use 12px; floating
  dialogs use 16px; conversational inputs and text bubbles use 20px.
- Desktop keeps a 52px icon rail and resizable labelled navigation, with a
  scrollable body for short windows. Main destinations match the mobile dock;
  additional workspace and portal capabilities remain available.
- Mobile retains its five destinations, compensated touch targets, safe areas,
  page scrolling, contextual sheets, reader and keyboard behavior.

`resolveNavButtonTokens` supplies `--ds-navigation-*` roles for explicitly chosen
system greys, including independently contrast-checked state text. Standard
Grey 6 uses the reference palette. Theme, increased contrast, reduced motion,
and existing per-platform preferences remain supported. Creator accents,
semantic status colors and uploaded artwork retain their separate roles.

Use the existing Button/IconButton and explicit `data-ui-shape`/
`data-ui-surface` roles for new interface elements. Portal interface surfaces
into the themed app shell so they inherit the same system. Do not recreate
palette values per feature or apply interface rules to media/artwork hosts.
