# Mobile startup and welcome

Portalink has two intentional mobile entry experiences:

- A restored signed-in session shows the complete supplied Hello World video once, with no extra fade or account buttons, then enters the app as soon as session restoration is ready. MOBILE Home loads underneath without extending the opening clip; WEB retains its existing Home readiness handoff.
- A signed-out MOBILE root visit shows Hello World before Home or signup. The opening video plays once, then the existing animated welcome offers email, sign-in, provider availability and guest viewing. Ordinary fragments such as `#projects` do not bypass welcome. Account forms temporarily hide and pause the welcome; returning resumes it. Continue as guest enters Home immediately and does not reopen welcome within that visit. No persistent first-visit flag is added. Recovery/callback URLs and direct public links retain their dedicated flow; a retained public-view session context keeps its existing destination.

Invite a friend shares `/?welcome=1` on the current site origin, through both native sharing and clipboard fallback. This explicit root invitation clears an old shared-profile session context after guest-session restoration, so it cannot redirect a recipient into a previously viewed creator's profile. The mobile recipient sees Hello World → Create account → Choose appearance and the existing onboarding flow. Copy public link remains a separate `/share/:profileId` link. Existing signed-in, authentication callback, password recovery and desktop entry behavior remain unchanged. Opening a new invitation shows welcome again; choosing Continue as guest does not repeatedly reopen it within that visit.

`ApplicationBootstrap.tsx` selects the flow. The initial HTML starts the muted clip before application JavaScript and styles finish loading. `PortalinkSplashLoader.tsx` adopts that same video element without resetting its playback position. The desktop reduced-motion still and presentation remain intentional.

## Media and recovery

- Primary video: `public/portalink-splash-mobile.mp4`, the supplied silent 512x720 H.264 clip, SHA-256 beginning `9c1a9457`.
- Loading/autoplay fallback: `public/portalink-welcome-loop.webp`, derived from that clip at its original dimensions and frame rate. It has 44 encoded frames, approximately 1467ms duration and SHA-256 beginning `307bdea0`. It is animation, not replacement artwork.
- The HTML preboot and React loader retain the same embedded first frame underneath playback, preventing a white flash before the first decoded frame. The HTML video lives outside React's root until the loader adopts it in a layout effect; its first-frame marker, playback position and natural end survive the handoff. No second video download, buffering grace timer or intentional still-image stage precedes playback. A cold network or browser autoplay restriction can still delay the first moving frame. Content fingerprints in the media URLs prevent reuse of an older asset identity; update these together when replacing media.
- The preboot, startup, mobile welcome and both sign-in presentations fit the actual asset ratio inside a sized media stage. Video and fallback occupy that same frame without internal letterboxing. A narrow inset canvas-colored blend covers the decoded/composited perimeter; border, outline and shadow resets apply only to these decorative assets. The existing artwork scale and mobile 1.4x welcome treatment are preserved. Sign-in explicitly keeps its pale backdrop regardless of theme or stylesheet load order. Shared preboot hides the whole sized media stage so its neutral loading label remains centered.
- Mobile video stays mounted on pauses/errors. At most two automatic retries follow a failure; foreground, page restoration, connectivity and user interaction allow another attempt. Hidden or unmounted surfaces pause playback, invalidate pending promises and clear retries/listeners.
- A painted video that has naturally ended wins over a delayed watchdog, even if WebKit has not delivered its `ended` event yet. An ordinary fallback completes its full visible cycle and then cancels pending retries/callbacks while Home finishes; guest welcome keeps its recovery loop. Decoded, unpaused playback whose time has advanced can reveal the first frame if WebKit delays its video-frame callback. Hidden, unready, paused or failed media stays covered by the embedded artwork.
- Per the latest product request, mobile startup/welcome always selects moving media, including when a reduced-motion preference previously selected a still. Reduced motion still suppresses the exit fade. Desktop reduced-motion behavior is unchanged.

The old `portalink-splash-mobile-poster.png` is no longer referenced by active application source or HTML. Retaining that file temporarily allows cached older application bundles to resolve their old fallback URL. The unused React `SplashScreen.tsx` has been removed. Other static brand icons, onboarding artwork and social link-preview images have separate purposes and must not be deleted to fix video playback.

## Home Screen launch and layout

In MOBILE standalone mode, the outer document, app frame and startup layers use a stable `100vh` height. The HTML identifies standalone mode before React through `(display-mode: standalone)` or iOS `navigator.standalone`. `useMobileViewportFrame.ts` skips viewport measurements in that mode so a temporarily short launch-time `visualViewport.height` cannot become the shell height. Safe-area insets pad controls inside the frame; they are not added to its height. The installed navigation wrapper stays fixed to the bottom with safe-area padding.

Ordinary browser tabs retain dynamic viewport sizing and the existing toolbar/rotation measurement behavior. The separate `useDialogViewport.ts` hook is unchanged and continues tracking the visible viewport for keyboards and dialogs. WEB presentation remains separate.

Installed WebKit can reserve a native status-bar region above the web view while `100vh` still includes that region and `100dvh` describes the drawable area ([WebKit issue 301994](https://bugs.webkit.org/show_bug.cgi?format=multiple&id=301994), confirmed in iOS 27 beta). The user's iOS 27.0.1 recording shows the launch image crossfading into artwork approximately 69 CSS pixels lower. Initial preboot and ordinary React startup now position their media by `min(0px, 100dvh - --mobile-launch-height)`, keeping the full-size stage and matching the full-device launch image. The correction remains while the final frame waits for Home. It is zero when the viewport heights agree; no phone-specific pixel offset, transient JavaScript measurement, status-bar translucency, or blank launch canvas is introduced. Welcome/account actions retain their existing layout. A new installed-iPhone recording is still required to accept the correction on physical iOS 27.0.1.

`index.html` declares 28 `apple-touch-startup-image` links for 14 phone size/DPR combinations in portrait and landscape. Their opaque PNGs in `public/startup/` contain the first frame on `#fdffff`, matching the preboot and splash. Regenerate both PNGs and the marked HTML link block with `node.exe scripts/generate-apple-startup.mjs`; the script requires FFmpeg and creates no new artwork. Keep dimensions, DPR and orientation media queries together when updating coverage. Apple documents the [launch-image link](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) and [device screen dimensions](https://developer.apple.com/design/human-interface-guidelines/layout).

These startup backgrounds are static images shown by iOS before the web application can render. The supplied moving media takes over when the HTML/application runs; the startup PNGs do not replace its animation or become video posters.

## What this cannot control

Safari may reject video autoplay. The animated fallback keeps this application surface moving in that case, but a browser can still suspend rendering in the background and unavailable network assets cannot be displayed before they load. No guarantee of uninterrupted playback in every browser state is possible.

iOS controls launch-image selection and caching and may still show a saved launch screenshot before the Home Screen web application executes. Website JavaScript cannot animate that operating-system phase. The declared startup images cover the listed phone sizes; local browser checks do not prove their selection on a physical iPhone. The manifest continues to start at `/`.

The existing `/portalink-media-reader.js` service worker only handles large project files under `/__portalink_media/`. It does not cache HTML, the application shell or splash assets. Do not unregister it or clear account storage to troubleshoot this animation. Shared profile/project routes are not expiring splash URLs; signed storage URLs for actual project files are a separate system.

## Verification and publishing

Run `node.exe --test tests/splash-lifecycle.test.mjs tests/mobile-viewport-frame.test.mjs tests/apple-startup.test.mjs` and the related account-entry/registration/dialog checks, typecheck and build. The splash tests cover fixed timing, guest looping, failure recovery, page restoration, callback cleanup and animation integrity. Viewport tests distinguish standalone CSS sizing from browser measurements; startup tests check PNG dimensions, opacity, color, integrity and pre-React standalone detection. Test real components with blocked playback locally, plus WEB preservation. Simulation is not physical-iPhone proof.

After publication, retest on a physical iPhone:

1. Remove the old Home Screen icon, open the current published site in Safari and add a fresh Home Screen icon so the installation can pick up the new launch metadata.
2. Force-quit the installed app from the app switcher, then cold-launch it from that icon. Check the startup background and animation transition, full-height frame and bottom controls before touching or swiping the page.
3. Repeat foreground restoration, supported orientations and Low Power Mode. Open the account forms and check the actual keyboard, reachable actions and dismissal. Record the device/iOS version and any remaining launch snapshot or sizing issue.

Source edits are not automatically live. Check the current handoff and Sites deployment status before telling the user a fix is published. Existing open tabs can retain the previously loaded JavaScript until navigation/reload; do not confuse that with an expired link. Publishing follows the existing documented Sites flow and needs the user's authorization.
