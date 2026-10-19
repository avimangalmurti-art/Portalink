# Mobile project authoring

This is the bounded design recipe for the upload, file order, cover and project-edit flows. It does not replace the desktop design or authorize unrelated redesign.

## Flow and navigation

Profile creation proceeds **Details → Files → Review → Publish**, including the initial project setup. Existing files-first entries retain **Files → Details → Review → Publish**. One shared step indicator follows the actual order. Back returns to the previous step in that order and retains the draft. The first step has no previous-step Back. Close exits creation through the existing discard/upload guard.

Editing a published project retains **Details / Files / Cover** sections and one **Save changes** action. Section changes retain unsaved edits. Back retains the existing discard guard; file removal takes effect only after saving.

Reorder is a supporting sheet, with the file count, a scrollable ordered list and **Done**. It uses the same glass material as other Portalink action sheets, including the existing opaque accessibility modes. Visible earlier/later controls make ordering available without precision dragging. Compact rows retain the full filename and metadata; a native **Check resolution** disclosure reveals the complete quality guidance when needed. Done returns to the same draft; it does not publish.

Cover adjustment is a focused full-screen task: **Cover shape → drag position / slider zoom → Save cover**. Cancel discards only that adjustment. Shape labels identify the actual ratio. The same saved frame is used in preview and Review; original media is retained.

## Surface and control rules

- Follow the user's active light/dark appearance through existing app tokens. Full-screen authoring is opaque content, not a floating dialog material. The screen and primary-action area use one continuous canvas; raised surfaces group related work. Keep the profile/feed covered through viewport and keyboard changes.
- Reuse the existing surface system: `--ui-surface-inset` (20px MOBILE), `--ui-surface-gap` (16px), `--ui-surface-title-size` (20px), `--ui-popup-radius` (24px groups) and `--ui-control-radius` (12px ordinary controls). Input text remains at least 16px. Circular 44px screen navigation stays distinct from rectangular form actions.
- Setup, upload, edit and cover adjustment use centered screen titles and the same navigation placement. Keep the title/exit and quiet step context outside the work-area scroller. Show portal context once. Allow long content to scroll instead of compressing it into one screen. Selected-file rails may scroll horizontally and include every selected file.
- Reserve space for creation's primary action. In the edit form, Save and validation remain in normal scroll flow so they cannot cover Description when the keyboard opens. Preserve reachable Back and native keyboard dismissal.
- Use a single prominent action for the current task: Continue/Review/Publish, Save changes, or Save cover. Setup has one explicit Continue action rather than a duplicate top checkmark. Empty Files starts with an explicit Choose files action; cover controls appear after selection. Secondary Edit, Add and Reorder actions have quieter treatment. All essential touch targets are at least 44px.
- Titles are required; descriptions are optional when creating and editing on both platforms. Show field-specific errors. Keep upload progress, cancellation, retry, draft recovery, storage cleanup and permission checks connected to their existing real state.

## Verification

Use 420×912 as the primary mobile preview, with 390px/430px and short keyboard-sized viewports as relevant. Check real scrolling, last-file access, later cover selection, ordering persistence, every Back path and crop Save/Cancel. Check the desktop branch and default action sheets separately. Synthetic previews and mocked transport do not certify actual iPhone Safari/Home Screen keyboard behavior or a real upload.
