# Apple experience audit implementation — 13 September 2026

The existing Portalink visual design and mobile/desktop presentation boundary are retained.

## 2026-10-22 - Published510 signed-in live image acceptance passed

Official portalinknetworks.com actually loads510 main-CCeGXPwA.js. Signed-in WEB1280x900 Structural Observations has32/32ready real full-resolution images (natural widths3375/4284/3024), all eligible delivery eager,0image retry buttons. WEB1280x600 scrollTop234.4/client586/scrollHeight863 proves reader scrolling; focused9 and Next10 load, Exit and own-profile navigation return a visible accessible profile with no dialogs/inert nodes. A CDP input deadline interrupted one mouse click; fresh state confirmed it had not navigated, and the profile link's normal Enter activation completed. No product state/data changed.

MOBILE420x912 Profile→8portals→Structural Engineering→Structural Observations entry retains observer gating (5mounted/ready, farpage32unmounted), document scroll reaches32 at scrollTop16358.4/total17270, then navigating through intervening pages yields32/32ready/complete full-resolution images and0retry buttons. Focused9 loads. Exit→Go back→Back to portals→Go back returns the fully visible Catalogue profile with18projects selected, header/links/dock restored, active project/actions controls,0dialogs/inert nodes and no horizontal overflow. Project gestures hint was dismissed with Got it; no appearance, layout, authored density, source content or backend settings changed.

First WEB reload after deployment showed preboot connection failure; its visible Try again recovered. Later fresh MOBILE reload opened signed-in profile normally with no preboot error. Sampled final console errors/warnings empty; this does not erase the initial startup retry or occasional automation/CDP deadlines. Media retry passed controlled local503/Retry tests on both platforms earlier; no actual live image failed/offeredRetry and no live network fault was injected. Physical iPhone/installedPWA behavior remains unverified.

External release-510-live-browser-proof.json records live observations and screenshots release-510-reader-{web,mobile}.png plus release-510-profile-return-mobile.png. Temporary viewport override reset to1536x639; original signed-in live owner profile left open/marked deliverable, unrelated reference tabs preserved. Standard helper processes exited; earlier owned4410fixture/tab stopped/closed. Native510/sourceed97eb0/PR140 unchanged; GitHub main/PR merge remains outstanding, not a deployment prerequisite waived by this receipt. Only three postpublication status docs dirty; frozen source/build/archive retained. No SQL, provider, environment, dependency, uploads, messages, account or real project edits. SAFE WRITER HANDOFF.

## 2026-10-22 - ALL reader image loading published510; live checks in progress

User explicitly approved publication and live MOBILE/WEB acceptance. Standard Sites source workflow pushed exact reviewed ed97eb040b9c52d85dd04ecead71c6e551eba2a9 on codex/reader-image-recovery to the existing source mirror; attached draft PR140 https://github.com/avimangalmurti-art/Portalink/pull/140 remains unmerged, GitHub main unchanged. This supersedes the earlier unpublished labels for this fix. Native saved version appgprj_6a9273ef43f8819198e0878a0020ad91~appgver_391dc121dd608191887270ad3f1df649 is510; deployment appgdep_6adae788efd8819180f4e7fb07cc36e7 succeeded2026-10-23T04:50:29.545702+00:00. Public audience/environment revision2 retained. Official https://portalinknetworks.com; native https://portalinknetworksinc.avimangalmurti566055.chatgpt.site.

47focused tests,6independent emitted-entry cases, typecheck, configured production client/worker build and main/visitor host/key guards pass; lint0errors111existingwarnings. Independent frozen archive audit GO:47611284compressedbytes/SHA25634e4e364db4a20bdb2043310c123f6980c47ac0609f4c82f3281e8413f664180;631files/630exactdistmatches plus permitted hosting newline normalization. Native tar82247680bytes/SHA25685fe8abdb6914fe88e41c4c89108ac9698801787222790902c151fdd84854a1e. All32CSSpayloads, worker/4approvedSQL/3mediahelpers/416publicassets unchanged509; project/D1/R2 preserved;0private/fixturemarkers. Source/test hashes unchanged. No Auth/backend/provider/SQL/content/environment/dependency change. Local actual-component WEB1280x900/MOBILE420x912 scrolling/focus/retry checks passed earlier; fixed-source live acceptance and physical iPhone/PWA checks remain pending. Owned post-save handoff note backed up in ignored logs before freezing source. Source/build/archive are frozen; postpublication status docs may be dirty.

## 22 October 2026 — consistent Reduce Translucency

The shared presentation now gives the explicit Portalink preference priority over
feature-specific modal, Portals, avatar, authentication and menu backdrop filters,
including body portals and decorative pseudo-elements. Scrim dimming stays in
place, while the scene behind a dialog is no longer blurred when reduction is on.
The Journey calendar toolbar also uses the existing opaque-material switch.
Normal appearance, layout, content filters and artwork are preserved.

The equivalent OS media rule is retained through production CSS optimization;
automatic OS detection still depends on browser support. Explicit app control
works independently. Mobile, web and public preference records keep their existing
scope. Actual physical iPhone/PWA and OS-preference emulation remain unverified.

Local verification:49focused cases,6built-entry cases, typecheck, lint and the
configured client/worker build pass. Fictional-service actual-App/Visitor browser
checks at420x912 and1280x900 cover light/dark dialogs, Portals, profile actions,
public Portal popups and body-portalled typography. Enabled samples have no
remaining backdrop filters; switching OFF restores the initial WEB material and
geometry sample exactly. This local fix is not a deployment receipt.

Publication: Sites509 from `0beecfd5a06834c6b29428f1ab3b4a2c9b4f778d`
succeeded on22October2026 (Pacific). See sites-deployment.md for native release
evidence. A subsequent live browser retry passes MOBILE420x912 and WEB1280x900
signed-out profile/Settings/account checks: opaque dock/navigation/Portal chooser,
unblurred dimmed Portal and avatar backgrounds, and an actual light confirmation
dialog. Explicit ON samples have no remaining visible backdrop filters, including
pseudo-elements. Original System/OFF settings and normal materials were restored;
no signup/content submission or new deployment occurred. Full raw-file comparison
remains incomplete after a separate403 response. Signed-in owner-only menus,
physical iPhone/PWA and actual OS reporting remain unverified. See external
release-509-live-browser-proof.json and the current handoff for exact evidence.

Subsequent signed-in live verification also passes representative light/dark
MOBILE420x912/WEB1280x900 owner Portal menus, WEB direct-body TypographyInspector,
mobile Portal panel/background/nested chooser, project information/content actions,
profile action sheet and Message settings dialog. Enabled panels are opaque and
backgrounds retain dimming without backdrop blur. No typeface or message-permission
choices were changed, no conversation opened and no content submitted. Both original
System/OFF appearance slots and normal materials were restored; viewport reset.
See release-509-signedin-browser-proof.json. This resolves the signed-in/owner-menu
verification gap; physical iPhone/PWA/actual OS reporting remain unverified. Separate
WEB reader image load failures observed during QA are not attributed to translucency.

## Implemented

- Public browsing no longer automatically presents sign-in. Explicit account entry, gated actions and verified password recovery still open the appropriate flow. Home's empty state offers an appropriate next action; the mobile search placeholder clearly says Coming soon.
- Profile, project and portal arrangements offer a scoped, one-change Undo/Redo after successful persistence. Failed restoration can be retried. Account/portal changes and membership changes invalidate stale history. Keyboard Undo is scoped to the relevant surface and leaves text editors and dialogs alone.
- Desktop project dragging stages positions locally and saves the final drop once. Mobile portal/project menus offer Move up/down as alternatives to holding and dragging. Project options remain visible and have 44px mobile targets.
- Menus support initial focus, arrows, Home/End, Escape, Tab dismissal and focus return. Mixed-control popovers use dialog semantics so sliders keep native keyboard behavior. New portal dialogs contain and restore focus. Destructive project confirmation starts with neutral focus; portal confirmation describes its consequences. Account deletion remains disabled, with no unsupported recovery promise.
- Custom radio controls support keyboard selection, including filtered icon results. Appearance switches have 44px targets around their existing 40px tracks. Body-portalled menus inherit High Contrast and Reduce Translucency. Mobile profile text can wrap and grow instead of being clipped to the avatar height.
- The fixed mobile navigation toggle uses a sidebar icon. Direct-entry Portals Back has a profile/Home fallback. Project loading and failure states precede missing/empty results.
- Message settings includes Blocked people and Unblock, with loading, errors, retry, confirmed success and focus recovery. Removing a block does not restore archived conversations or accept requests.
- A database migration separates content visibility from minimal identity needed by conversations, follow relationships and public comments. Private content permits only the owner and accepted followers. Conversation identities expose only name, handle, avatar and profile ID; existing message preference/request/block checks remain. Search scopes eligible identities before pagination. Comment identity hydration is batched.

## Verification

- TypeScript and production builds passed. ESLint passed with existing warnings; the new unused import found during comparison against HEAD was removed.
- Full Node suite: 337 passed, zero failures, one skipped (338 total). This includes new persisted-history, stale-response, failed-retry, final-drop, keyboard and message-identity tests.
- `scripts/verify-private-content-database.mjs`: nine checks passed against the complete migration history in isolated PGlite, using synthetic accounts only. Checks cover owner/follower content access, denied relationship-only content access, original and derived Storage files, minimal public-comment identities, private messaging history/search, block ownership and internal RPC privileges.
- Browser checks at normal desktop size and 390px/430px mobile widths: voluntary sign-in, heading focus on mobile account/recovery entry, 44px switch targets, one radio tab stop, High Contrast menu colors/borders, menu End/Escape/focus return, profile text flow, portal/project navigation and loading, Home search explanation, and no horizontal page overflow in sampled screens.
- These checks do not establish physical iPhone/PWA keyboard, safe-area or VoiceOver behavior. The browser was signed out; owner writes and Unblock were verified with isolated service/hook/database tests, not with real user mutations.

## Activation order and remaining limits

1. Applied `supabase/migrations/202609130001_private_content_boundary.sql` to the existing Supabase project on 13 September through its authenticated dashboard. The previous function bodies matched the tested baseline; all six replacement/new function bodies matched the migration after application. No real account or content records were changed for verification.
2. Live API verification returned the four permitted public identity fields and rejected anonymous message search. Hosted default function grants required explicitly revoking anonymous access to the internal identity helper; this is included in the migration and isolated test setup. All nine database checks passed again with those default grants represented.
3. The user explicitly authorized publishing this complete update to the existing Sites destination. The frontend can now be deployed after the required database update; the Sites deployment record is the authority for publication status.
4. Verify installed-PWA safe areas, text scaling and keyboard behavior on a physical phone, plus an owner save/Undo/Redo and blocked-person recovery after activation.

Existing signed media links can remain usable for their current six-hour lifetime. Narrowing new content access does not retroactively revoke those links or previously downloaded copies.

Production build output is reused for publication because the final deployment verification changed only the SQL migration, its isolated test harness and these notes.
