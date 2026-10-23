# Sites 439 live verification

Checked 16 October 2026 using the existing signed-in Codex browser tab. No application code changes or deployment were made during this check.

## Release identity

The native deployment status confirms Sites439 saved version `appgprj_6a9273ef43f8819198e0878a0020ad91~appgver_b97ad54981e08191bff22f5c0747d234`, deployment `appgdep_6ad24be586c081919467d5bce01d5760`, status succeeded and environment revision2. The reloaded page loads `/assets/main-CYcwfyqN.js`, matching the reviewed release manifest.

## Live checks performed

| Surface | Result |
| --- | --- |
| MOBILE 420x912 Home owner popup | SFSU project details show populated owner actions. Project options opens the actual sheet with Edit, Change cover and Delete project; Close dismisses it. No mutating command invoked. Popup380px wide and within viewport; no horizontal overflow. |
| MOBILE owner profile, reached through search | Wet Paint details opens a populated menu with Project options, Edit title, Edit description and Delete project. Dismissal works. |
| MOBILE New project | Profile action opens details-first form, not uploads. Eight existing portals and Create new portal are present. Blank Continue shows title validation. Graphic Design selection works; choosing Create new portal reveals the name field. No title/description/portal-name input or valid submission. |
| Desktop-size setup 1280x900 | The already-open details-first form remains mounted through resize,640px wide/full900px height, centered, no horizontal overflow. Cancel dismisses it. This is not a new desktop publisher opening. |
| WEB portal menu | Graphic Design owner menu opens with Hide, Rename, Change icon and Delete; Escape dismisses it. No command executed. |
| WEB project menu | SFSU index menu opens with Edit project, Change typography, Pin, Hide, Export, Copy citation and Delete project. Edit project loads existing files/details; Save changes remains disabled. Closed without editing or saving. |
| Saved collection | Empty; no bookmark added to manufacture a no-handler owner preview. |
| Console | Zero captured errors or warnings across the exercised browser flow. |

The owner profile still displays16 projects and8 portals after cancellation. We did not create or delete projects/portals/drafts, upload files, change visibility/order, save edits, bookmark/repost/comment or change account/provider/settings. Ordinary page navigation/reads are part of the app's normal operation; no passive-analytics suppression was attempted.

## Verification limits

This is a bounded, non-mutating live smoke check, not full publishing acceptance. `usePublishProject` automatically calls the Supabase `createDraft` service when the upload publisher mounts; that service inserts into `project_drafts`. Therefore we did not complete the mobile handoff or open the desktop New project publisher. Creating/removing a portal to reproduce stale membership, forcing a server refresh error and testing recovery would exceed this read-only task. Those cases retain the previous local automated/synthetic browser evidence: fresh confirmation, missing/wrong-owner portal rejection, account changes, form retention and retry without duplicate creation. All2059 local tests passed before release, but that is not live database proof.

No existing no-handler owner preview was available in the empty saved collection. Populated live menus were checked; the exact owner-with-zero-handlers suppression remains locally verified rather than claimed as reproduced live. Browser viewport emulation is not physical-iPhone proof. Held Google/Auth/SQL/provider work remains untouched.

Review captures (ignored): `logs/live-439-check/mobile-owner-menu.png`, `mobile-setup.png`, `desktop-owner-menu.png`. Temporary viewport override reset and original Home destination restored after testing; existing user tabs retained.
