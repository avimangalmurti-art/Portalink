# Shared control system

Equivalent controls use the same geometry and state behavior across Portalink. The shared implementation is `src/presentation/controls.css`, imported by the stable presentation root, with `Button` and `IconButton` as the default React APIs.

## Geometry and roles

| Role | WEB height | MOBILE minimum height |
| --- | --- | --- |
| Small action | 32px | 44px |
| Standard action | 36px | 44px |
| Large action | 40px | 48px |

Ordinary actions share `--ui-control-radius` (12px). Icon-only controls are square, retain accessible names, and use the same size scale. Labels determine text-button width. Keep related actions at the same size. Larger established sign-in, onboarding and publishing actions retain their workflow-specific dimensions.

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

### Mobile pill spacing

Mobile navigation and reader toolbars use the spacing tokens in `mobile.css`: 48px inner targets, 4px container inset, 4px between targets inside a pill, and 8px between separate controls. A standalone control and a grouped pill both have 56px outer height. Selected surfaces remain inside the inset rather than touching the pill boundary. Text and form actions retain their established semantic sizes; this contract applies to toolbar/composer geometry, not content-card hit areas.

Horizontal safe gutters are 16px, increased when the device safe area requires it. Below 360px, use 44px targets and 8px gutters so five navigation destinations and the separate Studio plus still fit. Bottom controls use the visible page's existing safe-area/viewport logic, not a hard-coded Safari toolbar height. Shared readers also clear the measured sign-in bar. WEB geometry is separate.

The same inset/gap values cover horizontal and vertical navigation, project action rails, focused-page actions, Studio segments and selection actions, and the message composer. Profile action rows use the between-control gap. Derive adjacent reader positions from outer control size plus gap; keep opening/closing anchors constant and scroll expanded actions rather than the Close control.

Navigation uses the shared neutral selection and ink tokens with its existing bar/capsule geometry and touch dimensions in `navigation.css`. The separate Studio plus action and moving navigation capsule are preserved. Switches, color swatches, icon-choice previews, drag handles, content/media hit areas, engagement states, and the plain mobile information glyph retain their own roles. Creator artwork and brand colors are not interface button fills.

The September 2026 sweep covers the shared primitives, navigation states, Messages header/filters, Appearance mode choices, common loading/project/crop/category dialogs, profile editor actions and links, and project attachment actions. MOBILE attachment rows place titles above their touch actions; WEB keeps one row. Inline text links and semantic content controls are deliberately outside the ordinary action-marker contract.

## Verification

Focused tests cover native button/ref/form behavior, loading and disabled guards, accessible state, selection contrast across appearance/gray/accent combinations, navigation precedence and the affected feature flows. Browser checks are still needed for CSS cascade, responsive visibility and surrounding layout. Use the existing MOBILE presentation boundary rather than new device detection; verify iPhone Air 420×912, nearby 390/430px widths and WEB1280 where relevant. Synthetic previews do not establish physical-phone behavior or live persistence.


## Floating surfaces — local premium consistency pass (2026-10-15)

Prepared for review only; unpublished. `src/presentation/surfaces.css`, loaded by the stable presentation root, supplies an explicit `data-ui-surface="popup|sheet"` opt-in. Confirmation dialogs, desktop portal creation, portal project choosers, project information and mobile action sheets share24px corners, a20px/600 heading with1.35 leading, a restrained existing theme shadow/border, and a consistent18px backdrop blur/saturation/tint. Attached sheets retain their flat lower edge; full-screen mobile portal creation and writing editors keep their established frames. Existing role/focus/gesture/viewport lifecycles and callbacks are unchanged.

Popup insets are24px WEB and20px MOBILE; body copy15px WEB/16px MOBILE at1.6 leading. Project content typefaces remain supplied by the creator. Compact menus use16px corners; ordinary controls use12px corners and500-weight labels. Shared semantic colors, selected/expanded/hover/disabled/loading/focus states and size scale remain intact. Confirmation actions retain48px minimum height and can wrap long labels. Confirmation text is left aligned. Short project-information cards fit their content; long descriptions keep the prior70dvh/640px scroll ceiling and safe viewport clearance, with footer actions outside the text scroll region.

Reduce Translucency/High Contrast use fully opaque surfaces with panel blur disabled; the existing modal backdrop separation stays on. A surface custom property resolves the mobile project's stronger material selector without removing accessibility-mode opacity. Reduced-motion behavior remains the existing shared contract. The scoped rules deliberately exclude frozen agreement source/copy, artwork, navigation geometry, reader layout and full-screen authoring; this is a first pass over shared primitives and selected floating families, not a claim every legacy custom popup has migrated.

Local component gallery/evidence is ignored under logs/premium-ui-qa. It imports actual components/styles and resolved appearance/control tokens, with harmless callbacks and connect-src none; no backend connection or real user write. Browser checks at1280x900,420x912,390x620 and430x932 cover light/dark, long content, native scroll(203px observed), footer/close reachability, no horizontal overflow, keyboard focus wrap/Escape, local form/action callbacks, sheet expansion and solid accessibility materials. Mobile portal creation remains420x912 and unmarked as a popup; WEB form is440x680, centered with24px corners. No browser console errors in final gallery. Not real device or full authenticated-app acceptance. Initial QA-only syntax/theme/token omissions were corrected; no production provider/env setting was changed. Browser gallery uses unminified CSS; the real minified build separately retains the new standard backdrop custom-property rule.

Prior local authentication/SQL work remains separately unpublished/unapplied. No publishing, Git push, SQL, backend/worker/D1 data, provider settings, dependency or new asset change is authorized by this design pass. See agent-handoff.md for final check results and review images.

Final validation:121 focused tests pass, typecheck and configured main/visitor client+worker build pass; lint0errors/113existing warnings, focused TSX lint0errors/1existing warning. Frozen agreement/SQL/operations hashes and whitespace pass. No publication or backend action.
