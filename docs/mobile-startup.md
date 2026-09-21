# Mobile startup and welcome

Portalink has two intentional mobile entry experiences:

- A restored signed-in session shows the supplied Hello World video for a 1500ms startup budget, with no extra fade or account buttons. Content can load underneath. If authentication is still unresolved at the deadline, the existing loading state waits for verification; startup must not bypass it.
- A guest opening `/` or a supported `/share/...` URL sees the same animation looping until they choose Sign in, Create account, password help, or guest viewing. Ordinary fragments such as `#projects` do not bypass welcome. Account forms temporarily hide and pause the welcome; returning resumes it. Recovery/callback URLs retain their dedicated flow.

`ApplicationBootstrap.tsx` selects the flow. `PortalinkSplashLoader.tsx` owns playback. The desktop clip, timing, poster and fallback remain intentionally different.

## Media and recovery

- Primary mobile video: `public/portalink-splash-mobile.mp4`, the supplied silent 512x720 H.264 clip, unchanged SHA-256 beginning `4d282896`.
- Mobile loading/autoplay fallback: `public/portalink-welcome-loop.webp`, derived directly from that clip at its original dimensions and frame rate using FFmpeg libwebp_anim, quality 80, compression level 6, infinite loop. It has 42 encoded frames (identical frames coalesced), 1499ms duration and SHA-256 beginning `6dceb1fd`. It is animation, not a generated replacement illustration.
- The HTML preboot and React loader use the same animated asset. The video has no mobile PNG poster or native playback controls. Content fingerprints in both media URLs prevent reuse of an older cached asset identity; update these together when replacing media.
- Mobile video stays mounted on pauses/errors. At most two automatic retries follow a failure; foreground, page restoration, connectivity and user interaction allow another attempt. Hidden or unmounted surfaces pause playback, invalidate pending promises and clear retries/listeners.
- Per the latest product request, mobile startup/welcome always selects moving media, including when a reduced-motion preference previously selected a still. Reduced motion still suppresses the exit fade. Desktop reduced-motion behavior is unchanged.

The old mobile PNG is no longer referenced by active application source or HTML. Retaining that file temporarily allows cached older application bundles to resolve their old fallback URL. The unused React `SplashScreen.tsx` has been removed. Other static brand icons, onboarding artwork and social link-preview images have separate purposes and must not be deleted to fix video playback.

## What this cannot control

Safari may reject video autoplay. The animated fallback keeps this application surface moving in that case, but a browser can still suspend rendering in the background and unavailable network assets cannot be displayed before they load. No guarantee of uninterrupted playback in every browser state is possible.

iOS may show its saved launch screenshot before the home-screen web application executes. Website JavaScript cannot animate or replace that operating-system snapshot. Verify cold launch, foreground restoration, Low Power Mode and actual Safari keyboard behavior on a physical iPhone after publication. The manifest starts at `/`; the application declares no Apple startup-image tag.

The existing `/portalink-media-reader.js` service worker only handles large project files under `/__portalink_media/`. It does not cache HTML, the application shell or splash assets. Do not unregister it or clear account storage to troubleshoot this animation. Shared profile/project routes are not expiring splash URLs; signed storage URLs for actual project files are a separate system.

## Verification and publishing

Run `node.exe --test tests/splash-lifecycle.test.mjs` and the related account-entry/registration/dialog checks, typecheck and build. The splash tests cover fixed timing, guest looping, failure recovery, page restoration, callback cleanup and animation integrity. Test real components with blocked playback locally, plus WEB preservation. Simulation is not physical-iPhone proof.

Source edits are not automatically live. Check the current handoff and Sites deployment status before telling the user a fix is published. Existing open tabs can retain the previously loaded JavaScript until navigation/reload; do not confuse that with an expired link. Publishing follows the existing documented Sites flow and needs the user's authorization.
