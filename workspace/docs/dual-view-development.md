# Portalink dual-view development

Document 05 setup: one existing Vite development server, multiple browser clients, no production or mobile-design changes. Updated after the separately authorized Document 04 architecture implementation; original setup evidence is distinguished below.

## Current status

- Local server running at **http://127.0.0.1:5173/** using the existing `.env.local` account connection and the command below.
- Two local browser clients were opened against that same server. CSS HMR reached both automatically, including a second shared-property update, without calling reload. That original HMR check used prototype data; it did not verify real-account authentication.
- In the original setup, both connected clients had desktop-sized viewports. The tooling exposes a browser-level viewport override; independent simultaneous WEB and phone-sized views were not established. Chrome was not available to the automation connection. The latest architecture checks used one connected tab sequentially.
- Document 04 has now been supplied and implemented: `AppPresentation` provides a stable WEB/MOBILE boundary, scoped frame styles and a shared presentation context. Phone widths initially retain the existing compact UI. See `web-mobile-architecture.md` for exact selection rules, files, checks and limitations.
- WEB, 390px and 430px checks, draft preservation, and temporary WEB-only/MOBILE-only style isolation passed sequentially. Independent simultaneous preview automation remains pending; this is not a claim that the complete Document 05 checklist passed.

## Start the single server

For normal development and real-account sign-in, use the existing local configuration. From `C:\Users\avima\OneDrive\Desktop\Portalink Platform`, open a fresh PowerShell terminal:

```powershell
npm.cmd run dev -- --host=127.0.0.1 --port=5173 --strictPort
```

This is the command verified on this Windows environment. Using `npm` resolved through a PowerShell wrapper and stripped the original CLI flags here; `npm.cmd` passed them correctly. No package script or Vite configuration change was required.

Vite loads the existing environment files, including `.env.local`. Do not add placeholder overrides for normal development. Process environment variables take precedence over these files, so a terminal carrying prototype overrides will keep using simulated accounts even after a restart.

Keep that one server running. Open additional views of its address instead of starting another server. `--strictPort` prevents an unnoticed switch to another port. Stop your server with Ctrl+C when finished.

### Optional prototype preview

Use prototype data only when intentionally reviewing simulated accounts and content. **Real Portalink email addresses and passwords will not authenticate in this mode.** Stop the existing server before starting this alternative in a dedicated terminal:

```powershell
$env:VITE_RUNTIME_MODE = 'prototype'
$env:VITE_SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY = 'YOUR_PUBLISHABLE_KEY'
npm.cmd run dev -- --host=127.0.0.1 --port=5173 --strictPort
```

These overrides do not overwrite `.env.local`. Prototype mode alone does not select simulated authentication when valid Supabase configuration exists; the placeholders select that service. To restore connected development, stop the prototype server, clear all three overrides, and run the normal command:

```powershell
$env:VITE_RUNTIME_MODE = $null
$env:VITE_SUPABASE_URL = $null
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $null
npm.cmd run dev -- --host=127.0.0.1 --port=5173 --strictPort
```

Refresh both browser clients after switching configurations. Prototype previews do not establish live authentication, messaging, upload, or same-origin worker/D1 API behavior. Use an appropriate isolated integration environment when testing account or content mutations.

## WEB and MOBILE windows

**WEB:** keep the Codex preview or a normal desktop browser window at **http://127.0.0.1:5173/**. Leave its desktop dimensions and device-emulation state unchanged.

**MOBILE:** open a separate Chrome window at the exact same address. Open DevTools (F12), select **Toggle device toolbar**, choose **Responsive**, and enter a width of **430px**. Also check **390px**. A height around 844px is a useful starting point, not a product constraint. Keep DevTools/device mode active in that window and arrange it beside WEB.

Chrome's [official device-mode instructions](https://developer.chrome.com/docs/devtools/device-mode) explain viewport sizing, touch simulation, orientation and the limits of emulation. Device emulation approximates a phone; it does not replace real-device verification.

No new route, iframe dashboard, device badge, duplicate app, second server, networking dependency, or production UI is needed. Connecting that Chrome window to the automation tools would enable assisted checks. Otherwise the same workflow works with the user operating the phone preview manually.

## Refresh behavior and verification

| Change | Behavior / current evidence |
| --- | --- |
| CSS | **Verified:** a temporary, non-visual CSS custom property appeared in both open clients after a source edit, changed in both on the next edit, and was removed afterward. No manual reload was used. |
| Shared React component | React Fast Refresh is enabled by the existing Vite React plugin. Compatible edits should update each connected client; React-component update/state retention was not separately exercised in this setup. |
| WEB-only / MOBILE-only presentation | Document 04 added scoped platform frame styles. Distinct temporary outline rules applied only to their matching WEB or MOBILE view at WEB/390px/430px and were removed afterward. This was sequential in one client; simultaneous independent viewport automation remains unverified. HMR can deliver source to both clients while only matching presentation rules apply. |
| Incompatible module/export or bootstrap change | Vite may invalidate the module or reload the document. Form/component state may reset. Do not promise that every source edit preserves state. |
| Environment or launch flags | Stop and restart the one server with the intended values, then refresh both clients. |
| Vite configuration | Vite can restart automatically; confirm its terminal output and refresh both clients if needed. |
| Service worker, manifest or installation metadata | A manual refresh or update/reopen cycle may be required. These are not ordinary React/CSS HMR changes; inspect the worker/install state explicitly. |
| Server worker / D1 behavior | Plain Vite browser preview is not sufficient proof of the deployed API/worker behavior. Use its separate integration environment. |

During the original Document 05 check, temporary CSS probes were appended to `src/index.css` and removed by restoring its exact original bytes. SHA-256 at that time: `b46297f82dde18baddfd940a00e67c20c1b0c47b61e93a4b5c71994ff532e8b7`. That is historical evidence, not the current file checksum: Document 04 subsequently extracted the frame rules. Its separate platform outline probes were also removed. Neither check was a full visual regression run.

## Optional physical phone

LAN access is **not enabled** in the running setup. The server listens on loopback only. A phone cannot use the computer's `127.0.0.1`; on the phone that means the phone itself.

If physical-phone testing is requested, restart the same server with the intended connected or prototype configuration and:

```powershell
npm.cmd run dev -- --host=0.0.0.0 --port=5173 --strictPort
```

Use the computer's active trusted-LAN IPv4 address, obtained at that time, in `http://<computer-LAN-address>:5173/`. Give the user the exact address after verifying the running network. Do not hard-code it into application files, expose a public tunnel, weaken production security, or start an additional server. No exact LAN URL is supplied here because LAN access was not enabled or tested.

Raw LAN HTTP is useful for initial layout/touch checks. Service workers, the multipart media reader and PWA installation require a secure context; physical-phone authentication callbacks also need correct isolated redirect configuration. Those tests need trusted HTTPS and an appropriate non-production integration setup. Do not bypass certificate warnings or edit production callback/security settings for this workflow.

## Original Document 05 files and handoff

- **Added:** `docs/dual-view-development.md` to record the actual Windows command, preview procedure, observed HMR result, limitations and remaining checks.
- **Temporary only:** `src/index.css`, restored byte-for-byte after HMR verification.
- **Unchanged:** application code, package files, Vite configuration, dependencies, environment files, manifest, service worker, account-deletion guards and production deployment.
- **Preserved:** the pre-existing `index.html` title edit and the previous `docs/web-mobile-codebase-audit.md` report.

Document 04 subsequently changed application presentation code as recorded in `web-mobile-architecture.md`; the original unchanged-file list above describes only the earlier setup stage. The minimum separation stage is now implemented. Remaining preview work is to connect/configure an independent phone viewport and verify both clients side by side. Mobile navigation, styling and feature redesign remain separately scoped work.
