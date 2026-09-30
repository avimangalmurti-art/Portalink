# Shared control system

Equivalent controls use the same geometry and state behavior across Portalink. The shared implementation is `src/presentation/controls.css`, imported by the stable presentation root, with `Button` and `IconButton` as the default React APIs.

## Geometry and roles

| Role | WEB height | MOBILE minimum height |
| --- | --- | --- |
| Small action | 32px | 44px |
| Standard action | 36px | 44px |
| Large action | 40px | 48px |

Ordinary actions share `--shape-compact` (10px). Icon-only controls are square, retain accessible names, and use the same size scale. Labels determine text-button width. Keep related actions at the same size. Larger established sign-in, onboarding and publishing actions retain their workflow-specific dimensions.

Use `primary`, `secondary`, `ghost` or `danger` for the action's purpose. Primary and destructive actions retain semantic colors; secondary and ghost actions use the chosen System Gray and resolved Light/Dark appearance. A ghost action has no resting fill.

## Interaction states

- Hover is available to fine pointers only. Touch does not depend on hover.
- Selected/current/checked controls and expanded menu triggers retain a visible neutral gray state; hover does not erase it.
- An enabled press takes precedence over selection and hover, then returns to the persistent state.
- Surface and foreground change together. Selected gray is opaque and its text is contrast-checked so it remains readable on light and dark parent surfaces.
- Disabled/loading actions do not respond or acquire hover/pressed styling. Shared action controls use one 45% opacity treatment. Native button semantics, form association, callbacks, refs and focus behavior remain intact.
- Keyboard focus has a visible 2px outline. Reduced-motion preferences remove the shared color transitions.

Pass native ARIA state through the primitive: `aria-expanded`, `aria-pressed`, `aria-checked`, `aria-selected`, or `aria-current`. An ordinary icon action must not imply a toggle state. `IconButton.isSelected` is for actual toggles.

When a native button must stay in place to preserve a feature's composition, opt into the same stylesheet using `data-ui-control="button"` or `"icon"`, `data-control-size="sm|md|lg"`, and `data-control-variant="primary|secondary|ghost|danger"`. Keep native disabled and ARIA semantics. Do not add a competing hover color or a new corner radius. Responsive visibility utilities must override the zero-specificity default display rule.

## Purposeful differences

Navigation uses the shared neutral selection and ink tokens with its existing bar/capsule geometry and touch dimensions in `navigation.css`. The separate Studio plus action and moving navigation capsule are preserved. Switches, color swatches, icon-choice previews, drag handles, content/media hit areas, engagement states, and the plain mobile information glyph retain their own roles. Creator artwork and brand colors are not interface button fills.

The September 2026 sweep covers the shared primitives, navigation states, Messages header/filters, Appearance mode choices, common loading/project/crop/category dialogs, profile editor actions and links, and project attachment actions. MOBILE attachment rows place titles above their touch actions; WEB keeps one row. Inline text links and semantic content controls are deliberately outside the ordinary action-marker contract.

## Verification

Focused tests cover native button/ref/form behavior, loading and disabled guards, accessible state, selection contrast across appearance/gray/accent combinations, navigation precedence and the affected feature flows. Browser checks are still needed for CSS cascade, responsive visibility and surrounding layout. Use the existing MOBILE presentation boundary rather than new device detection; verify iPhone Air 420×912, nearby 390/430px widths and WEB1280 where relevant. Synthetic previews do not establish physical-phone behavior or live persistence.
