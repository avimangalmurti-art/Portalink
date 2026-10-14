# Motion system

Scope: motion only, on the existing app and visitor surfaces. This branch is stacked on the fixed-header task (PR55); it does not integrate Terms, Explore density, or the other pending features. No SQL, worker deployment or publication.

## Implementation

`src/presentation/motion/motion.css` owns the 120 / 180 / 260 ms scale and entrance/exit curves. Authored CSS, utility classes, Framer transitions, native transitions and Web Animations read these tokens. Gesture recognition windows, startup/video budgets and network timers retain their existing meaning.

The DOM-less `MotionNavigation` adapter preserves router URLs, history, authentication and permissions. Its defaults also work without a router, preserving standalone citation PDF previews; the citation entry mounts the image observer independently. Dock taps cross-fade; pushes and app Back use directional transitions; Studio tabs cross-fade with the header held outside the root snapshot. The project cover pairs with one destination first page. BrowserRouter uses its supported `useTransitions={false}` option so native callbacks commit React synchronously, suppressing the older duplicate screen layers. Async history work is bounded by the slow token, and aborted native snapshots release the UI and recover with a cross-fade. Unsupported browsers use an inert outgoing copy and a cross-fade. A reserved reader frame appears before snapshot/route work; the first page uses the selected image's aspect ratio.

Actions and Cite use `useSheetMotion` to keep dismissal mounted through the reverse animation. Downward drag follows the pointer. Actions run in the original tap, retaining clipboard/share activation; an inert copy supplies their exit animation. Image loading changes paint only and releases its listeners when images leave the document. Reader, Studio and profile loading use final-layout bones, with loaded paint fading in.

All existing reduced-motion rules remain, with one shared override and runtime checks for the new API/animations. No navigation destination, theme, copy, data model or loaded-screen layout is changed.

## Terms remains separate

The pending Terms feature is not present in this branch. When it lands, it can use `data-motion-scrim`, `data-motion-sheet`, and `useSheetMotion` for approved exit actions. Its acceptance gate must continue to reject swipe, backdrop and Back dismissal; sharing motion never grants permission to dismiss that gate.

## Verification

See [QA evidence](qa/motion-system/README.md). Source tests reject any authored CSS time literal outside the three definitions, and cover native invocation, nested routing, deferred dock handlers, reduced motion, image lifecycle, reader bones and reservation before expensive fallback work. Existing feature tests retain their permission/data/interaction assertions with explicit motion fixtures.

No browser test runner has been added to the project. CLS and visible-frame timings are instrumented measurements of the real components in the local browser, using synthetic services. Physical iPhone behaviour remains unverified. GitHub Actions billing remains deferred.

## Requested report — unchanged destinations

Dates below are the first tracked Git changes, in America/Los_Angeles time; they do not establish an earlier prototype's history.

| Entry | Current destination or action | Added |
|---|---|---|
| Dock Explore | `/`: the Home discovery feed. Search remains its separate route. | Current label/mapping: [Oct 6, 2026](https://github.com/avimangalmurti-art/Portalink/commit/c849344). An earlier world/Explore dock entry was [added Sep 30](https://github.com/avimangalmurti-art/Portalink/commit/7fbef58) and [removed later that day](https://github.com/avimangalmurti-art/Portalink/commit/1299880). |
| Repost | Toggles the project's repost engagement; it does not navigate. Signed-out viewers enter the auth gate. Own reposts are available at `/p/:profileId/activity/reposts`. In the information popup, the Repost action can instead open the participant section within that popup. | Project engagement: [Aug 28, 2026](https://github.com/avimangalmurti-art/Portalink/commit/7b82ca1). Page-level controls: [Aug 31, 2026](https://github.com/avimangalmurti-art/Portalink/commit/7301b0c). |
| Profile Collaboration | Mobile: `/p/:id/collaboration` (shared: `/share/:id/collaboration`), the existing “A space to work together” placeholder; tools are not available. WEB retains its existing action: open Messages for that creator. | Profile control: [Sep 20, 2026](https://github.com/avimangalmurti-art/Portalink/commit/0884e9c); dedicated screen: [Sep 29, 2026](https://github.com/avimangalmurti-art/Portalink/commit/5d73bfa). |
