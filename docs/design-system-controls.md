# Shared control system

Portalink shares control roles across MOBILE and WEB. The stable presentation root imports `controls.css`, `navigation.css` and `surfaces.css`; feature styles retain their intentional platform differences. Use `Button`, `IconButton` and `InterfaceIcon` for new equivalent controls.

## Corner geometry by role

| Role | Current token | Application |
| --- | --- | --- |
| Floating surface | `--ui-floating-radius: 32px` | Confirmation dialogs, project information, project choosers and comparable floating menus |
| Standalone action | `--ui-action-radius: 999px` | Text actions such as Save, Continue, Publish and Delete |
| Selectable row | `--ui-row-radius: 14px` | The element painting a conversation, navigation or project-index highlight |
| Floating capsule | `--ui-capsule-radius: 999px` | Existing floating navigation and grouped action capsules |
| Circular icon action | `--ui-icon-radius: 50%` | Appropriate equal-width/height Settings, Back and Close controls |

These values are implementation choices for the approved visual reference. Attached sheets retain flat lower corners; drawers retain their attached edges. Joined rows retain straight internal joins and round the group's outer edges. Borderless controls stay borderless. Do not turn grouped controls into separate standalone buttons.

Cards, feed/project cards, category tiles, thumbnails, artwork, PDF pages, embedded previews, media clipping, avatars, switches, drag handles and full-screen editors retain their existing geometry. The legacy MOBILE 3px fallback remains for these excluded elements. Opt eligible interface controls into semantic shapes instead of broadly deleting that fallback.

For legacy controls, use `data-ui-shape="action|icon|row|capsule|popup|sheet"` on the element painting the shape. This changes geometry only, preserving existing materials, colors, typography, states and handlers. The important shape layer deliberately outranks lazy feature CSS and MOBILE fallback overrides. Body portals need the existing `data-presentation` scope.

`data-ui-surface="popup|sheet"` additionally opts a surface into the established shared material/type treatment. Use the shape-only marker when only geometry should change. The floating-surface treatment retains current backdrop, accessibility modes, focus, dismissal, scrolling and viewport lifecycles. Confirmation actions can wrap long labels.

## Compact size scale

| Control family | WEB | MOBILE |
| --- | --- | --- |
| Shared small action/icon | 32px | 44px |
| Shared standard action/icon | 36px | 44px |
| Shared large action/icon | 40px | 44px |
| Context-sheet primary actions | Existing platform composition | 68px |
| Context-sheet list rows | Existing platform composition | 48px |
| Catalogue sharing actions | Existing platform composition | 48px |
| Named onboarding/publishing primary actions | 40px | 44px |
| Main desktop navigation controls | 36px | Existing MOBILE navigation |

Labels determine text-action width. Preserve wrapping and larger heights required by content. Keep related actions at the same scale. A legacy action/icon may use `data-control-size="sm|md|lg"` with its shape-only marker without replacing feature paint or typography. The marker supplies minimum height; icon controls also receive equal dimensions.

Do not shrink essential MOBILE targets below 44px. Where painted controls are smaller, retain their existing compensated touch region. The bottom dock is unchanged: its grouping, inset spacing, dimensions, destinations and compensated targets remain under the existing navigation rules. Do not apply desktop compact sizing to MOBILE.

## States and semantics

Use `primary`, `secondary`, `ghost` or `danger` for purpose. Shared primitives keep existing semantic colors, selected gray/ink, hover, press, loading, disabled and focus behavior. A ghost action has no resting fill. Native buttons, form association, refs, callbacks and accessible names remain intact.

Pass actual state using `aria-expanded`, `aria-pressed`, `aria-checked`, `aria-selected` or `aria-current`. An ordinary icon action must not imply a toggle. Touch actions do not depend on hover. Keyboard focus remains visible; reduced-motion and solid accessibility materials keep their existing behavior.

A legacy native button can opt into the full primitive contract with `data-ui-control="button|icon"`, `data-control-size` and `data-control-variant`. Unlike shape-only markers, this also supplies shared paint/type/state rules. Responsive visibility utilities must still override the primitive's zero-specificity display default.

## Icon language

Use shared Lucide icons through `InterfaceIcon`, retaining accessible labels and existing callbacks. Current semantic choices include reorder arrows for Reorder, an opening/navigation arrow for Open, Pencil for direct Edit, UserSearch for account search, Bookmark for Save page, FilePenLine for Drafts, Share for catalogue sharing, and ChartNoAxesColumn for Insights. Back/Close use shared icons rather than font glyphs; directional Back mirrors in RTL where appropriate. Overflow continues to use an ellipsis when it opens a menu.

Artwork, logos, avatar content, status marks and intentional navigation identities are outside this icon correction pass. Do not add decorative icons to every text action.

## Verification and release state

Use actual components to check light/dark appearance, selected/disabled/focus states, portalled surfaces, wrapping and immediate surroundings. The primary MOBILE baseline is 420x912; use nearby widths and WEB where affected. Focused existing tests cover feature behavior; browser checks establish CSS cascade and geometry. Synthetic previews do not establish physical-phone behavior, live persistence or production rollout.

The October 22 audit fixes are local source changes until separately published. A passing build is not a deployment. See `agent-handoff.md` for current check results, limitations and ownership; see `sites-deployment.md` for the live version.
