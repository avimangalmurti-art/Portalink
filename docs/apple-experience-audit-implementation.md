# Apple experience audit implementation — 13 September 2026

The existing Portalink visual design and mobile/desktop presentation boundary are retained.

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
