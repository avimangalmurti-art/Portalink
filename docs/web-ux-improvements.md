# Immediate WEB UX improvements

Local follow-up to the mobile update, September 29, 2026. The user asked to improve
the WEB experience. This continues the isolated `codex/trust-and-activation`
branch after `9a1ff62`, with the existing product, desktop sidebar, shared backend
and MOBILE presentation retained.

| Area | Desktop behavior |
| --- | --- |
| Discovery | World returns Home and city returns World. Invalid/empty cities and legacy Search provide an onward action. A labelled city search offers exact selection with arrows, Enter, Escape, clear and no-results feedback. The globe fits its available width and height. |
| Gallery | Home and profile expose the existing 2–13 density choices and Reset through a native select. Artwork proportions and saved density semantics are unchanged. Reorder hides the layout control. |
| Continuity | Saving an owner's density keeps that owner's normal profile mounted during its refresh. Account changes, visitors, shares, other routes, errors and missing profiles keep their existing guards. MOBILE retains its preceding refresh behavior. |
| Messages | Keyboard focus reveals the action group. Edit supports Escape to cancel and Ctrl/Cmd+Enter to save, with composition/pending guards and focus restoration. Unsend focuses Cancel. Empty searches/filters offer recovery; an empty conversation pane offers New message. |
| Publishing | More selected files fit in the desktop list. The Publish footer and existing requirement text stay reachable while scrolling. Dropped OS files append to both empty and populated pickers; internal reorder uses a distinct payload and rejects malformed/out-of-range indices and upload locks. |
| Saved collections | Empty saved projects/pages/creators offer Explore the world, retaining loading, error, privacy and pagination behavior. |

## Verification

- Typecheck, client/server production build and lint pass. Lint: zero errors,
  84 existing warnings. Existing chunk/plugin build warnings remain.
- Final full Node/PGlite runner: **950/950 passed, zero failures or skips**.
  The existing file-menu test's missing presentation mock was corrected before
  this final run; focused publishing/menu checks also pass.
- Independent source reviews cover discovery keyboard handling, owner/profile
  isolation, gallery integration, file-drop guards and mobile preservation.
- Simulated browser: 1365/1280px WEB Home/profile Layout, five-column choice and
  Reset; exact London search with Enter; city recovery; 1024×640 globe/search fit;
  640px no-result/clear path without horizontal overflow; at 1024×480 the fifth
  keyboard-selected result stays visible, the page stays stationary, and Enter
  opens that exact city. At 390px the original mobile globe/dock has no desktop
  search field.
- Actual message-list components in an ignored synthetic fixture: WEB edit
  Enter/Escape, Ctrl+Enter local save, action-group visibility, Unsend Cancel and
  return focus; 430px mobile sheet retained. No real messages sent or changed.
- Actual MediaPicker/ProjectFormDialog in an ignored synthetic fixture: six-file
  list around 173px tall at 1280×720, sticky Publish, and reachable focused
  Description/Publish at 1024×540. At 430px the original compact file disclosure
  and mobile form remain. The fixture's cover is a labelled synthetic stand-in.
- File-drop/reorder behavior is covered by event-handler tests; no claim of
  native OS drag, hosted upload, physical phone, software keyboard or PWA testing.
  Browser logs show the existing React `fetchPriority` warning. Temporary tabs
  are closed, viewport restored and the owned preview stopped; QA files remain
  ignored and excluded from release.

## Limits and release state

The existing overlapping globe-dot targets remain unchanged. Desktop city search
provides a precise alternative; it does not repair the shared hit algorithm.
No unavailable destination was enabled, and no feature was removed.

Published with the user's approval as **Sites v270**, source `caf7b21`, at
2026-09-29 07:21:59 UTC. The website and its existing Sites worker are live; see
[the publication receipt](agent-handoff.md). No dependency, connected-service,
account, data, SQL or configuration changes. No GitHub push/merge or separate
PDF/video worker deployment. The preceding PDF safety migration is still
unapplied and account deletion remains disabled. Follow the separate PDF rollout
requirements in `trust-and-activation-release.md`.
