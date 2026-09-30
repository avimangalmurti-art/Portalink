# Shared profile first paint

Source only. No application publication, hosted SQL, Storage change or live
performance measurement is implied by these changes.

The Vite `sharedProfilePreloadPlugin` adds Supabase and font connection hints to
both HTML entries. Only `share.html` receives its inline classic script, which
starts the anonymous `shared_profile_bundle` request while the visitor module
graph is loading. It uses the existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` configuration. The generator accepts public
publishable keys or legacy anonymous JWT keys; it omits the request for missing,
placeholder, service-role or secret-key configuration. No session, cookie or
local-storage read is involved.

The request is scoped to canonical UUID shared profile, category, project and
collaboration paths. It omits credentials, disables caching and redirects, and
has an eight-second abort deadline. Its handled promise is stored temporarily in
`window.__PORTALINK_SHARED_BUNDLE_PRELOAD__`. The first matching
`readSharedProfileBundle` call takes that promise, whether pending or complete,
and applies the existing public parser and exact missing-RPC fallback rules.
Null/private results, permission errors, malformed replies and network failures
never trigger a silent second RPC. Explicit retry makes a fresh read. Entries
older than thirty seconds or for another profile are discarded; there is no
durable preload cache or authenticated-state adoption.

The Sites worker selects `share.html` for every `/share/` navigation that prefers
HTML, including invalid paths, which remain in the visitor not-found experience.
Metadata and preload lookups still require canonical UUID routes. The worker
selects the existing application shell for ordinary routes. Ordinary browser requests
receive the shared shell without waiting for worker-side metadata queries or
cover signing. The visitor updates its document title after public data arrives.
Known link-preview crawler user agents retain the existing bounded, anonymous
metadata generation and visibility checks. This user-agent choice changes only
optional preview HTML, never database permission. Unrecognized crawlers receive
the generic shared shell, so a preview service outside this user-agent list may
show generic Portalink metadata until it is explicitly supported. Shared HTML remains `private, no-store`; hashed assets
retain immutable caching. Existing `/api/media-interactions` and D1 paths are
unchanged.

## Local production asset audit

The client build recorded on 2026-09-30 emits **761,995 bytes of
initial visitor JavaScript across 14 chunks** (242,215 bytes when each file is
gzip-compressed locally). The normal application entry loads 991,959 raw JS
bytes. These measurements follow every emitted static import recursively;
dynamic imports are excluded until their feature opens. The visitor also links
321,570 raw CSS bytes (51,551 gzip bytes). HTML, fonts, images and public-data
responses are separate from these totals. Local gzip size is not an observed
hosted transfer size.

The requested **350,000-byte raw JavaScript target is not met**: the visitor
remains 411,995 bytes over it. Its visitor entry file is only a small part of
the initial graph. The measured emitted chunk sizes explain where the rest sits:

| Emitted chunk | Raw JS bytes | Retained content |
| --- | ---: | --- |
| `localPreferences-MV8Ani13.js` | 464,172 | Mixed shared code: Supabase SDK, router, public profile/auth helpers, presentation, icons and motion helpers |
| `react-dom-DUpco3P6.js` | 132,690 | React DOM and scheduler |
| `proxy-1hujRSjB.js` | 109,773 | Motion implementation and a small bundler wrapper |
| Other 11 chunks | 55,360 | Visitor entry, grid density, auth context, avatar/header helpers, icons and runtime |
| **Total** | **761,995** | **All initial static JS dependencies** |

Chunk names do not identify all their contents: the large `localPreferences`
chunk is shared by both entries and is not merely the preferences service. The
bundler's per-module `renderedLength` metadata helps estimate the relative family
weights inside mixed chunks. These are **pre-minification code-length signals,
not measured download bytes**; different modules minify differently, so they
must not be added to or substituted for the raw totals above.

| Retained module family | Sum of `renderedLength` |
| --- | ---: |
| Application modules | 360,593 |
| Supabase SDK | 358,669 |
| React, React DOM, scheduler and router | 290,946 |
| Motion | 259,063 |
| Lucide and React Icons | 60,864 |
| Other dependencies and bundler runtime | 14,732 |

Supabase's canonical client retains Auth, PostgREST, Storage and its realtime
dependencies even though the visitor initially performs only session restoration
and public reads. Shared UI retains motion and icon machinery, and the public
read fallback retains common profile mapping, discovery ranking and city data.
The measured graph therefore still needs further client/UI dependency reduction
to reach 350 KB; moving unopened feature entry points alone has not achieved it.

The emitted initial graph contains no PDF.js, document/PDF, video, audio or model
renderer; upload/write `mediaService` or `contentServices`; project detail or
processing readers; comments/engagement or creator-save service; messaging,
publisher/editor, onboarding, globe, settings or notification UI; or mock/runtime
prototype modules. AuthDialog is also deferred. Shared media-type metadata in
`features/publishing/assetTypes.ts` and individual message/globe/settings icons
remain; those are not the corresponding feature implementations. Opening a
project or invoking an authenticated action intentionally loads its canonical
services and UI on demand. The three emitted-entry regression tests pass for
this build. This graph audit establishes loading boundaries, not runtime timing
or successful real-account interactions.

Focused tests use mocked browser fetches, generated script execution and existing worker fixtures. The existing opt-in in-memory SQL test was skipped in this task; no SQL was run. They verify early request adoption, no duplicate
request, invalidation/expiry, timeout/error behavior, configuration filtering,
route entry selection, crawler previews and existing interaction access. Actual
network timing, hosted routing, crawler behavior, response headers and first
paint require separately authorized deployment checks. Browser measurements must
distinguish synthetic preview evidence from live Supabase timings.

Exact before/after totals and every initial chunk are recorded in [visitor-entry-assets.md](visitor-entry-assets.md), including local browser evidence and the unapplied-cover rollout limitations. The anonymous REST request uses the public key on `apikey`, consistent with the [Supabase REST API guide](https://supabase.com/docs/guides/api/quickstart).
