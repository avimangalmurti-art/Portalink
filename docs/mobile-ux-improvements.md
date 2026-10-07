# Immediate mobile UX improvements

Local implementation, September 29, 2026. The user approved the seven immediate
improvements together. These adapt the phone presentation while retaining the
existing WEB workflows, shared data and five-button mobile dock.

| Area | Implemented behavior |
| --- | --- |
| Discovery | Home has a working Explore action instead of an inactive search field. Empty Home has one exploration action. City returns to World; World returns to Home. |
| Project cards | One tap on mobile artwork opens the project. A separate 44px Info button reveals details on cards at least 112px wide. Compact cards keep direct opening. WEB hover/touch preview behavior remains. |
| Messages | A visible options button opens a touch-sized reaction/edit/unsend sheet. Existing ownership rules and Unsend confirmation remain. Focus moves into Edit or confirmation Cancel and returns after cancellation. |
| Publishing | The disabled Publish action explains the next missing requirement. Mobile file-picker copy describes choosing files from the device. |
| Gallery and gestures | Layout exposes 2–13 columns, Comfortable, Compact and Reset through existing density persistence. Pinch remains available. A dismissible image/PDF overview hint explains the existing focus and control gestures. |
| Project navigation | The five-button dock retains its width. Project controls sit in a separate row above it. Scroll-triggered controls return after a calmer 700ms idle period, with tap and keyboard recovery retained. |
| Empty states | Empty city and saved collections offer onward navigation; empty filtered Messages offers Clear search or Clear filter. Existing create/publish entry actions remain. |

Saving density originally invalidated the owner's profile and remounted its
mobile workspace, closing Layout. The app now keeps only the same authenticated
mobile owner's profile mounted during that background refresh. Account/profile
changes, WEB, visitors, shared links, other routes, errors and missing profiles
retain their existing guards.

## Verification

- Full existing Node/PGlite runner: **931 passed, zero failures or skips**.
  After the final profile-refresh fix and resolved-media hint correction,
  **49 focused tests passed**, covering workspace/account isolation, first
  publication, card taps, density and gesture hints. Additional message focus
  regression and independent reviews passed.
- Final typecheck, client/server production build and lint pass; lint retains
  **86 existing warnings, zero errors**. Existing build chunk/plugin warnings
  remain. No dependencies changed.
- Simulated local browser QA at 390px and 430px: discovery return/empty recovery,
  publisher disabled guidance, one-click project entry, separate card details,
  Layout density/reset and retained panel after save, contextual hint dismissal,
  and dock/project-control separation. WEB at 1280px retains its sidebar and
  omits mobile Layout/Info controls.
- Actual message-list/sheet components in an ignored synthetic fixture: 390px
  sheet, Edit and Unsend-cancel focus, 430px incoming-message reactions, and
  existing WEB controls. No real messages or account writes. Only the existing
  React `fetchPriority` warning appeared. Test tab closed, viewport reset and
  task preview stopped.
- No physical phone, soft keyboard, installed PWA or hosted end-to-end testing.
  Browser pointer tests do not establish real touch/pinch behavior.

## Separate finding

The globe has an existing overlapping-city hit-target issue: London/Paris can
share the same pointer area, allowing Paris to intercept a click aimed at London.
The hit sizing/order in `GeographicLayer.tsx` and `geoScene.ts` is unchanged by
this update. Nearest-marker or clustered selection is a separate follow-up.

## Release state

Published with user approval as **Sites v270**, source `caf7b21`, at
2026-09-29 07:21:59 UTC, alongside the WEB UX follow-up. See the publication
receipt in `agent-handoff.md`. Source remains on `codex/trust-and-activation`
in the isolated task worktree. No GitHub push/merge, Supabase SQL or separate
PDF/video worker deployment. The preceding trust/activation PDF migration is
still unapplied; its rollout requirements remain in
`trust-and-activation-release.md`.
