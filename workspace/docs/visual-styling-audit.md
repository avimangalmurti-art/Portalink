# Visual styling audit — 9 September 2026

High Contrast and Reduce Translucency are connected to working, persisted preferences. Their coverage is inconsistent because some components override the shared appearance tokens or never consume them. The user's expectation is appropriate: these settings should affect the relevant interface across navigation, profiles, content presentation, and overlays, including before sign-in.

This is an audit and proposed correction set. No application code was changed during this audit.

## Existing rules to retain

- **High Contrast:** strengthen text, control/state separation, meaningful boundaries, and keyboard focus without changing component size, spacing, corner geometry, or the identity of the accent color. This is already the stated CSS contract in [src/index.css:569](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:569>) and the settings promise in [src/components/settings/NavigationButtonsPanel.tsx:240](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/settings/NavigationButtonsPanel.tsx:240>).
- **Reduce Translucency:** replace actual interface glass with opaque surfaces and remove its blur. Already-opaque surfaces need not change. Decorative scene content, artwork, shadow alpha, semantic tints, and visibility animations are separate roles ([src/index.css:634](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:634>)).
- **Content:** photos, profile images, video, PDFs, and creator cover framing retain their original pixels. Contrast improvements belong to the surrounding UI or a separate edge drawn above the media.
- **Public websites:** creator accent, gray, and theme remain creator choices; accessibility preferences belong to the visitor. [src/App.tsx:164](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/App.tsx:164>) already implements this split.
- **Default visual character:** preserve restrained, borderless normal-mode controls and fixed semantic engagement/destructive/status colors. A High Contrast-only boundary is different from restoring a border on every normal click.

## Findings and proposed corrections

### 1. Main navigation shapes do not gain contrast

**Evidence:** With High Contrast off and on, all eight main navigation controls retained the same 12% system-gray tint, zero border, and no shadow. Icon stroke increased from 1.75px to 2px, but the shape boundary did not change. The compact phone rail showed the same behavior.

**Cause:** [src/index.css:4698](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:4698>) fixes the resting fill, `:4723` removes selected fills/edges, and `:4882` removes navigation borders/shadows. These late overrides defeat earlier contrast rules at `:3369`.

**Correction:** give the existing navigation rule family an explicit High Contrast treatment for resting, hover, selected, and focused states. Increase shape/background separation or use a restrained contrast-only edge. Keep all dimensions and normal-mode styling. **Level: shared navigation component/styles.**

**Intentional difference:** ink-only portal selection is documented. Retain its accent identity; avoid replacing all selected portals with large filled cards merely to make the toggle conspicuous.

### 2. System-gray selection overrides the stronger state token

**Evidence:** [src/data/navButtonTokens.ts:197](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/data/navButtonTokens.ts:197>) and `:207` initially compute stronger selected surfaces for High Contrast. The system-gray branch at `:217` then replaces them with fixed black 10% or white 14%, regardless of preference. App supplies a system gray at [src/App.tsx:1144](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/App.tsx:1144>).

**Correction:** resolve the selected surface using both the chosen gray and High Contrast. Consumers such as shared panel/project rows can then inherit the improvement. **Level: token resolver.**

**Intentional difference:** a chosen system gray is already opaque, so Reduce Translucency should not recolor that base gray just to demonstrate activity.

### 3. Profile collection squircles lack a High Contrast boundary

**Evidence:** The Portals grid used the same 65% surface, zero border, and no shadow with High Contrast off/on. With Reduce Translucency on, tiles correctly switched to opaque `rgb(44,44,43)` and removed blur; their edges still did not gain contrast. The same collection component also renders followers/following, although populated people lists were not available in this session.

**Cause:** [src/index.css:4392](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:4392>) defines the tile material without an adaptive edge. The working opacity overrides are at `:4415`.

**Correction:** add a High Contrast boundary or stronger surface separation to the existing masked tile, keeping its squircle shape and separate label. Ensure the edge follows the mask and works with both opaque and translucent material. **Level: shared profile collection component/styles.**

**Intentional difference:** photographs inside profile tiles should remain unchanged. Text-only profile count tabs at [src/index.css:4436](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:4436>) intentionally have no container; they should not become new cards.

### 4. Contrast around project content is inconsistent

**Evidence:** Feed cards use `.individual-content-outline::after` with a transparent resting edge and reveal it only on hover/focus ([src/index.css:1380](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:1380>)). Enabling High Contrast therefore does not reveal that edge at rest. Profile cover buttons request a semantic inset ring ([src/components/UserProfilePage.tsx:276](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/UserProfilePage.tsx:276>)), but their absolutely positioned full-size cover is painted above the button surface (`:278`); the ring can be obscured by opaque media. The visible placeholder edge in the inspected profile is not sufficient proof that every real-media cover has a visible edge.

**Correction:** reuse the existing over-media outline for a High Contrast resting edge where necessary to distinguish interactive content from its background. Apply consistently to feed/profile/project content wrappers; do not filter, recolor, resize, or crop the artwork. **Level: shared content-wrapper styling, with profile cover layering verification.**

**Intentional difference:** borderless media presentation is normal-mode design. White frames inside PDFs may be part of the document itself. Do not mistake them for application borders or add doubled edges. Exact visual strength and profile ring occlusion need verification during implementation against light, dark, and transparent real media.

### 5. Account/category popup menus reset High Contrast

**Evidence:** The live account menu was under a body carrying High Contrast, but its own `theme-dark accent-theme` root resolved `--hairline` to normal-mode white 18% and secondary text to `#b7b7bd`. Its opaque background correctly respected Reduce Translucency.

**Cause:** menus create local theme roots in [src/components/Sidebar.tsx:324](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/Sidebar.tsx:324>) and `:541`, then portal to body. App mirrors accessibility classes onto body ([src/App.tsx:235](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/App.tsx:235>)), but local theme declarations at [src/index.css:477](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:477>) override inherited tokens. Same-element selectors such as `.high-contrast.theme-dark` no longer match the menu root.

**Correction:** carry the complete effective appearance/accessibility contract through the shared portal boundary, or avoid resetting those tokens inside menus. **Level: shared portal/theme boundary.**

**Intentional difference:** menus can retain their own elevation and dark/light material, but should not lose the visitor's contrast preference.

### 6. Page-comment text and borders bypass High Contrast

**Evidence:** In both desktop and 390px phone views, High Contrast left the page-comment border at white 10% and secondary/empty-state text at white 55%. Reduce Translucency correctly made the popup background opaque `rgb(18,18,20)`.

**Cause:** fixed white opacity classes are used for page labels, authors, comment bodies, placeholders, and delete affordances in [src/features/media-interactions/MediaInteractionBar.tsx:147](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/features/media-interactions/MediaInteractionBar.tsx:147>); [src/index.css:5341](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:5341>) fixes the outside border at 10% white.

**Correction:** use a small shared set of dark-media UI foreground/edge tokens with High Contrast values. **Level: shared media-control tokens and comments component.**

**Intentional difference:** retain the permanent dark popup and fixed engagement/status hues. The comment fetch reported activity temporarily unavailable in this session, so populated comment styling was inspected in source, not exercised with real comments.

### 7. Borderless controls lose keyboard focus indication

**Evidence:** [src/index.css:1433](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:1433>) forces both outline and box shadow to none for focused `data-borderless-control` buttons, defeating the High Contrast focus rule. Affected examples include project options ([src/components/UserProfilePage.tsx:292](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/UserProfilePage.tsx:292>)) and project/viewer header controls ([src/components/profile/ProfileCategoryPage.tsx:361](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/profile/ProfileCategoryPage.tsx:361>)).

**Correction:** retain borderless pointer-click/hover behavior, but allow a visible keyboard-only focus indicator, including High Contrast. **Level: shared control rule.**

**Intentional difference:** this respects the earlier request to eliminate unwanted click borders. Keyboard navigation needs a distinct focus state; it does not require a permanent border.

### 8. Outgoing chat metadata and actions remain dim

**Evidence:** timestamps, Edited/Sending/receipt labels, and outgoing-message actions use fixed 70–75% opacity in [src/components/MessagesPage.tsx:482](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/MessagesPage.tsx:482>). The accent foreground and those opacity levels do not respond to High Contrast.

**Correction:** separate state visibility from readable ink and supply stronger message-metadata/action values when High Contrast is enabled. **Level: message component/tokens.**

**Intentional difference:** preserve the accent bubble color and hover-reveal behavior. Not every translucent reaction tint is interface glass. This finding is source-confirmed; authenticated conversations were not opened or changed.

### 9. Cover-selection overlay controls remain translucent

**Evidence:** `--surface-media-control` keeps fixed alpha .72/.76 ([src/index.css:410](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:410>), `:495`). Cover badges/drag affordances and preview controls in [src/components/publishing/CoverFilmstrip.tsx:86](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/components/publishing/CoverFilmstrip.tsx:86>) and `DraftPreview.tsx:137` consume it without the protected media-control material attribute. The opaque override at [src/index.css:3724](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:3724>) cannot reach them.

**Correction:** connect this legacy token to the existing glass-alpha preference or use the shared media-control material. **Level: shared media material/token.**

**Intentional difference:** thumbnails and crop masks remain content/interaction context. Whole-control hover visibility is not automatically a translucency defect. No files were uploaded to inspect this source-confirmed issue.

## Working or intentionally different

- Welcome/account controls now use the preferences directly and visibly; the preferences persist through reload.
- Profile collection tiles, viewer navigation, engagement bars, and comment-popup backgrounds already become opaque with Reduce Translucency ([src/index.css:4415](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:4415>), `:5206`, `:5295`, `:5340`).
- Most ordinary dialogs and menus already use opaque surfaces; no additional opacity change is expected ([src/index.css:4125](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:4125>)).
- Shared fields and many separators consume strengthened semantic tokens. A stronger page-frame separator does not prove that every descendant button does too.
- Modal background blur is an explicit existing exception ([src/index.css:2673](<C:/Users/avima/OneDrive/Desktop/Portalink Platform/src/index.css:2673>)). Making the entire backdrop sharp/opaque would be a change to that product rule, rather than a missing preference connection.
- Native browser tooltips/audio controls are browser-owned; their exact styling cannot be governed by application tokens.
- Accent samples, avatar/media pixels, disabled states, semantic colors, and corner geometry should not all change merely to show that a switch is on.

## Recommended implementation order

1. Repair shared selected-state tokens and portal inheritance.
2. Add preference-aware treatment to the navigation, collection tiles, and existing content-edge layer; restore keyboard focus.
3. Migrate remaining fixed media/comment/message values to the appropriate existing token roles.
4. Verify both toggles independently and together in dark/light modes, all system grays, public/private presentations, keyboard navigation, and representative desktop/phone widths.

Avoid a blanket `border` or `opacity: 1` rule on every element: it would alter artwork, semantic tints, and intentional default styling while leaving the actual ownership/cascade problems unresolved.

## Verification and limits

Live local-browser inspection covered the welcome preferences, Appearance settings, main navigation, a public profile's project/portal views, the account menu, and a project viewer/page-comment popup. High Contrast was compared on/off; Reduce Translucency was independently checked on profile tiles. A 390px phone preview confirmed the same navigation/comment gaps. Original preferences (both on) were restored and the temporary viewport was reset.

Source inspection covered light/dark rules, public appearance, shared primitives, authenticated messaging, publishing controls, profile editing consumers, and the mobile presentation boundary. This is not a claim that every authenticated state, device, browser-native control, or OS preference combination was exercised. No real account, message, project, or file was modified. No application tests/build were run because this task produced an audit only.
