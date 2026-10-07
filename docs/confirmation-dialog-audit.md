# Confirmation audit — 2026-10-04

Scope: ALL presentations. Searched all source JS/TS/JSX/TSX by delete/remove/discard/clear/reset/revoke/disconnect/overwrite, unsaved/leave, confirm, alertdialog and modal implementations. Raw findings are ignored logs/confirmation-full-audit.txt and logs/confirmation-audit.txt. Observer/listener cleanup and URL revocation are not product actions. No browser-native confirm/beforeunload implementation found.

| Existing interaction | Before | Decision |
| --- | --- | --- |
| Project delete | Dedicated DeleteProjectDialog with its own modal, failure and pending | Shared ConfirmationDialog; exact existing service/deletion/navigation |
| Publish/edit draft discard; Studio bulk discard | ProjectDiscardConfirmation + DiscardConfirmationLayer | Thin existing adapter to shared component; cleanup errors retained |
| Portal delete | Capability-aware mini-dialog inside menu | Shared centered dialog; capability gate/recheck and store policy preserved; failure stays open |
| Project comment/reply delete | Inline CommentThreadView alert | Shared confirmation; same cascade consequence and deletion hook |
| Page comment delete | Direct API mutation | Added shared pre-confirmation; optimistic store logic retained, boolean result exposed for keeping failed UI open |
| Message unsend | Inline bubble confirmation | Shared confirmation; both-person consequence, existing mutation |
| Block participant | Conversation-local modal | Shared confirmation; existing block handler |
| Delete message request | Direct mutation | Shared decision before removal; existing handler |
| Account-detail discard | Desktop inline + mobile DiscardConfirmationLayer | Shared dialog in both presentations; original exact pending-leave callback and dirty state |
| Description/Bio discard | Custom children in DiscardConfirmationLayer | Shared dialog, existing fullscreen host and editor cleanup |
| Remove all draft files | Inline group confirmation | Shared confirmation; published projects unaffected |
| Profile editor Back | Direct exit | Added dirty-state confirmation; safe Cancel retains editor, avatar and links; mobile Back registration |
| Start-here introduction selection/removal | ProjectFormDialog confirmation-shaped surface | Shared standard variant; reversible selection and existing update handler |
| Then/Now pair removal | Reversible profile selection | Remains immediate; projects unaffected |
| Archive conversation | Confirmed despite restore on new message | Removed unnecessary decision; existing reversible archive |
| Profile-link removal | Three inline confirmations for staged edits | Immediate staged edit; original data remains until Save, profile dirty exit now protected |
| Single file/attachment removal/replacement, photo clear/crop | Staged editor/picker changes | No new modal; editor draft discard/save protections retained |
| Bookmarks, likes, saves, mute/hide/pin, layout/theme reset | Reversible actions | No new confirmation |
| Account deletion | Capability/status/email verification surface | Kept hard-disabled existing gate; not a generic confirmation or permission to enable deletion |
| Publish confirmation, reports, auth reset/verification | Review/form/status workflows | Remain outside decision component; no success notifications converted |

One UI implementation: src/components/ui/ConfirmationDialog.tsx + confirmation-dialog.css. Existing ProjectDiscardConfirmation is compatibility mapping only, not a second modal. DiscardConfirmationLayer removed. API includes title/description/action labels/standard or destructive/pending/error/disabled async callback; safe focus, nested trap, Escape/mobile Back Cancel, return focus, duplicate lock, same-context error/retry, non-dismissible backdrop, actual visible viewport/safe areas/fullscreen host. Theme danger tokens distinct from accent. No new store operations, SQL or backend services.

Limit: browser reload/close cannot be intercepted with a custom application modal; no native unload prompt added. Navigation outside existing editor close/Back paths was not rewritten into a global routing guard. Account deletion remains disabled.
