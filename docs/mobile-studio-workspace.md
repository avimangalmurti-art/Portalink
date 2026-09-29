# Mobile Studio workspace

Implemented September 29, 2026 on `codex/mobile-studio`, based on the current owned branch at `9d9cc56`. Scope is MOBILE through the existing presentation provider (maximum 639px). Source is local and unpublished.

## Result

- The existing five-button dock enables Studio. `/studio` is private on MOBILE and retains the existing WEB placeholder. MOBILE `/saved` uses the same Studio screen, fixed to Bookmarks with the existing Projects / Pages / Creators tab URLs.
- Category URLs use replacement navigation, so changing filters does not fill browser history. Explicit category links override a remembered List View. The view preference uses the existing appearance utility with a mobile-only key.
- Studio has a visible Back control, large title, real successful-read time, Select and view options. Icon-only category pills expand the current category with its label and accent fill. All and List View contain sections for Drafts, Published, Bookmarks and Activity.
- Published uses the owner's canonical profile projects, newest publication first. Bookmarks reuse the same project, saved-page and saved-creator loaders as the existing library. Activity uses the existing notification hook and destinations. Missing targets stay understandable and can still be unsaved. Save dates are not fabricated where services do not expose them.
- Search filters the loaded category. Saved pages retain cursor paging and explain that search/selection covers loaded pages. Refresh, empty, loading and error states use existing state components.
- Rows reuse ProjectCover / CreatorAvatar, expose explicit options and at least 44px controls, and open existing destinations. Published offers Share / Edit; Bookmarks offers Open / Unsave; Activity offers Open / Mark read when unread. Long press opens an accessible action sheet with Share / Copy link for public targets. Notification links are not shared.
- Touch gestures reuse the existing navigation-intent classifier. Left swipe reveals valid actions; right swipe exposes Open; full swipe opens the existing target. Edge gestures, vertical intent, multitouch and interactive child controls are excluded. Mouse and keyboard users have explicit controls. No new gesture library was added.
- Selection replaces only the floating dock, preserving the left rail. Bulk Unsave, Mark read and Share appear only for applicable selected rows. Mutations are sequential, account guarded and retain failed selections. Exiting restores the dock and focus; removing the final visible bookmark focuses the heading.
- **Bottom placement:** search is in the header to avoid crowding at 390px. Only New project floats above the unchanged dock, with an **8px gap**, measured at both 390px and 430px. It invokes the existing creation entry; published Edit uses the existing project editor.

## Accepted capability gaps

The user chose **“Use existing capabilities; document the gaps.”**

1. **Drafts are partially persisted, not resumable.** `project_drafts` stores metadata through the existing publishing service. There is no list/get/resume service, and selected upload files live only in the current publishing flow. Studio therefore says draft details cannot be reopened here yet; it does not claim that the account has no drafts, invent local storage, or expose fictitious Edit/Delete actions. Listing/resuming drafts requires a separate service and file-restoration design.
2. **Mark unread is not available.** The notification service supports Mark read and Mark all read. A uniqueness constraint for unread message notifications also makes a naive reversal unsafe. Activity right/full swipe uses **Open**, as accepted. No SQL or new notification action was introduced.

## Code and shared safeguards

New Studio files: `StudioPage.tsx`, `StudioRow.tsx`, `StudioActionSheet.tsx`, `useStudioRowGesture.ts`, `useStudioData.ts`, `studioModel.ts`, `studioView.ts` under `src/features/studio/`.

Integration: `src/App.tsx`, mobile navigation/back components, scoped `mobile.css`, and `appearancePreferences.ts`. The app remains a single stable provider/root. Only MOBILE Studio uses its own nested scroller. WEB Saved/Activity markup and existing destinations remain.

Shared reuse: saved collection loaders moved into `src/features/library/collectionQueries.ts`; the existing clipboard fallback moved to `src/utils/copyPublicLink.ts`. The account, engagement and notification hooks expose successful read times without inventing remote timestamps. Notification mutations and foreground refresh now guard both overlap orders, avoiding a stranded loading state. Saved-page pagination errors stay scoped to Pages/All. Canonical services, identifiers, Auth, Supabase, Sites/D1 data, dependencies and configuration remain unchanged.

## Verification

- Focused tests cover category/URL and view persistence, `/saved`, private MOBILE / unchanged WEB routing, nested scrolling, dock availability, selection/bulk behavior, swipe mapping and cancellation, account changes, successful-read timestamps, pagination retry, canonical unsave and both notification refresh races.
- Typecheck passes. Full lint passes with **0 errors / 84 existing warnings**. Client/server production build passes with existing chunk/plugin warnings.
- Final full Node/PGlite runner passes **984/984, zero failures/skips**. The first run's single failure was a VM test missing the newly added `isMobileStudioOpen` input; the profile-scroll harness now supplies it and checks Studio's nested scroller separately.
- Browser checks at **390×844 and 430×932**: all categories, saved tabs, search, selection/dock swap, successful and failed bulk actions, focus after final removal, both swipe directions/full-open, long press, Categories/List View persistence, back/destination links, empty/loading/error recovery. No horizontal overflow; compose-to-dock gap is 8px at both sizes.
- Actual local app at **1280px** retains the WEB Studio placeholder and WEB Saved sign-in route. Actual MOBILE Studio/Saved uses the existing auth gate and enabled dock. No new application runtime errors were observed. The existing React `fetchPriority` warning remains in the isolated cover fixture.

### Limits

Signed-in interaction QA used the actual Studio UI/model/gesture/sheet/navigation/CSS in an **ignored, isolated local fixture** with synthetic auth/data/editor adapters. No production mocks were added. The fixture blocks backend/network writes; its initial duplicated-context bundling error was fixed before the recorded checks. Gesture helpers dispatch synthetic touch PointerEvents with a test-only pointer-capture shim.

This establishes browser layout and component interaction, not physical-phone touch, software keyboard, safe areas, installed PWA, live authenticated API/Realtime, sharing OS UI or upload/editor persistence. Creation and destination callbacks were verified with explicit fixture receipts; actual downstream publishing was not performed. Paging and partial-failure semantics are additionally covered by hook tests. The reference Mail PDF informed layout only; no private reference content appears in the product.

## Delivery boundary

No push, merge, Sites publication, worker deployment, SQL, migration-ledger repair, dependencies or connected-service changes. Live remains **Sites v270 / source `caf7b21`**. The previously prepared PDF migration remains unapplied; separate PDF/video workers remain undeployed and account deletion stays disabled. QA files and logs are ignored and excluded from source/hosting artifacts.
