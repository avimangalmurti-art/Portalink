# Fixed mobile app headers

Task branch: `codex/studio-fixed-header`. Based on current `github/main` and fast-forwarded to the existing live-source PR53 (`f81f0342cc9d42c90cbf12aefa642ff97b0b3621`). This review is stacked on PR53; it excludes the unpublished Explore-density PR54 and all other pending feature tasks. Main/CI billing and publication remain separate.

One shared, active-screen-only fixed pill header is used by mobile Studio, the Messages inbox, and signed-in app profiles. It is portalled to the stable app shell to avoid transformed/scrolling ancestors, uses the dock material, centres the selected pill horizontally, and keeps one Actions button. Dock state controls Back and survives list/thread navigation. Desktop layouts and public visitor profiles/readers retain their existing presentation.

Studio lists start with search, remove visible repeated headings and refresh timestamps, use made-on calendar dates and plain two-line summaries, expose row actions through hold/context menu/keyboard, reserve dock/safe-area clearance, and share the six empty states. Bookmarks uses outlined category pills; the dock uses the app active colour. Overview content and deferred Add reference are unchanged.

[Review screenshots and browser measurements](qa/studio-fixed-header/README.md).

Validation: complete local regression **1,712/1,712 passed**; focused Drafts follow-up **4/4 passed**, including filtered Select all and keeping Done available after a zero-result search. Typecheck passed; lint passed with 0 errors and 112 warnings. Client/worker build, configured main/visitor bundle graphs, and the visitor gate passed. Browser checks and limits are in the screenshot gallery. GitHub CI remains unavailable because the user deferred the existing billing restriction. No SQL, backend configuration, billing, merge, or publication is authorized by this task.
