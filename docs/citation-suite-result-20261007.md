# Citation full-suite comparison — 7 October 2026

Sites352: 1567 tests, 1430 passed, 136 failed, 1 skipped. Citation branch: 1584 tests, 1382 passed, 201 failed, 1 skipped. All 136 baseline failures persist; 65 additional failures are listed below. These are not classified as existing baseline failures. Typecheck and production build pass; lint has 0 errors and 110 warnings.

The legacy source-evaluation loaders do not automatically follow new imports. The errors below indicate fixture/contract gaps, not proof that runtime behavior is correct. This suite is failing and does not establish release readiness. No tests were disabled or removed to obtain these results.

[All baseline triage rows](sites352-test-triage-20261007.md).

| Test | Observed failure |
| --- | --- |
| feed PDF covers sign only the selected rendered page while full viewers keep every page | "Cannot read properties of undefined (reading 'slice')" |
| cover-only hydration strips originals/PDF page paths before signing and never initializes multipart readers for thumbnailed projects | "Cannot read properties of undefined (reading 'slice')" |
| opening the same document uses full hydration and retains its original viewer attachment | "Cannot read properties of undefined (reading 'slice')" |
| owner hydration identifies hidden projects and hidden portals before offering a live share card | "Cannot read properties of undefined (reading 'slice')" |
| production builds choose the durable registry; development and explicit prototype retain runtime selection | 'Unexpected import ./src/server/citation' |
| the production startup graph excludes mock identities, seed imagery and unopened large dialogs | 'Unexpected import ./src/server/citation' |
| anonymous public reads use anonymous RLS and expose no account-specific state | \|- |
| private, hidden-project and hidden-portal access follows the verified caller policies | \|- |
| revocation is checked afresh before every read or write, including comment deletion | \|- |
| attachment identity, project membership, current image ordinal and known PDF bounds are enforced | \|- |
| original documents without a recorded count retain their bounded browser-reader interactions | \|- |
| a batch authorizes once, deduplicates targets, and denies the whole read if any target is forbidden | \|- |
| upstream errors and malformed access responses fail closed without activity reads or writes | \|- |
| expired, unavailable and malformed account verification never reaches D1 or the target query | \|- |
| saved lists and unsave remain private and usable after content access is revoked | \|- |
| comment deletion is scoped to the verified author and authorized target, with no forbidden response leak | \|- |
| attachment storage paths stay opaque, including long Unicode and PostgREST metacharacters | \|- |
| project: capabilities and cap for {"signedIn":true} | \|- |
| shared: capabilities and cap for {"signedIn":true} | \|- |
| shared visitor actions offer auth and preserve the existing return destination | \|- |
| shared current-page registration retains auth-gated actions alongside portfolio navigation | \|- |
| twenty simultaneous card reads use one bounded engagement summary call | '../../features/engagement/capabilities' |
| large summary lists are deduplicated and divided into at most 200 IDs | '../../features/engagement/capabilities' |
| only a missing RPC uses the compatibility path, not permissions or network failures | '../../features/engagement/capabilities' |
| an account switch cancels queued reads instead of resolving new-account flags into old consumers | '../../features/engagement/capabilities' |
| visible-page batch verifies once, uses two reads, and isolates own activity | 'Missing ./server/citation' |
| page batches are bounded and expired sessions do not read activity | 'Missing ./server/citation' |
| hashed assets are immutable; HTML revalidates; missing assets never return the app shell | 'Missing ./server/citation' |
| worker handle and UUID routes use canonical internal assets without leaking their redirect | \|- |
| draft, publish (including fallback), and edit services pass the entire description | 'network' |
| legacy publication cannot silently discard a chosen location; WEB fallback remains supported | \|- |
| summary requires a verified bearer session and reads no D1 for guests or expired sessions | 'Unexpected module ./server/citation' |
| non-owner and self-assigned owner metadata cannot read timings | 'Unexpected module ./server/citation' |
| only a matching configured profile and its verified account can reach the aggregate query | 'Unexpected module ./server/citation' |
| owner relation response is rechecked instead of trusting a query or editable metadata | 'Unexpected module ./server/citation' |
| unset or malformed owner configuration fails closed before data access | 'Unexpected module ./server/citation' |
| verification failures never reach D1 or identify a requester as the owner | 'Unexpected module ./server/citation' |
| a confirmed owner can see a migration-pending state; invalid methods and subroutes remain closed | 'Unexpected module ./server/citation' |
| redirected owner lookup never follows Location or grants access to D1 | 'Unexpected module ./server/citation' |
| saved pages reads existing bookmarks privately and paginates same-time saves without duplicates | 'Missing test import ./server/citation' |
| signed-out and expired sessions cannot list or remove page bookmarks | 'Missing test import ./server/citation' |
| removing one page is idempotent and leaves other pages, accounts, likes and reposts untouched | 'Missing test import ./server/citation' |
| browser shared navigations receive the visitor shell without waiting for metadata reads | './server/citation' |
| normal app routes retain the app shell while shared HEAD requests stay bodyless and skip metadata | './server/citation' |
| project card binds every route ID and uses matching project cover, summary and article type | './server/citation' |
| category card keeps collection title and binds its first project lookup to the collection | './server/citation' |
| project metadata selects the owner relation explicitly when profiles also pins a project | './server/citation' |
| cover selection honors explicit cover then image preference without borrowing another project | './server/citation' |
| a fallback image at the final slot of the supported 105-attachment project is eligible | './server/citation' |
| PDF cover uses the chosen rendered page and its actual dimensions, never the original PDF URL | './server/citation' |
| hidden or mismatched project, creator and category relationships fail closed | './server/citation' |
| missing, unusable, multipart, video and dimensionless covers keep the generic preview | './server/citation' |
| cover object paths reject external URLs, sibling profiles, traversal, query strings and control characters | './server/citation' |
| rendered PDF pages must belong to the selected attachment and project and have dimensions | './server/citation' |
| only same-origin signed image URLs for the exact requested storage object are accepted | './server/citation' |
| redirected metadata and signing requests keep generic HTML without following Location | './server/citation' |
| HTML preference parser respects specificity and q values | './server/citation' |
| HEAD navigation stays bodyless, strips stale validators and makes no Supabase lookup | './server/citation' |
| ordinary navigation keeps the normal shell and generic metadata without a lookup | './server/citation' |
| all invalid /share/ paths use the visitor shell without metadata lookup for preferred HTML | './server/citation' |
| invalid shared HEAD uses the visitor entry and non-HTML requests keep the original path | './server/citation' |
| non-HTML and unsuccessful asset responses pass through unchanged | './server/citation' |
| portfolio card and pasted-link metadata use the profile avatar rather than latest project cover | './server/citation' |
| nested handle project crawler metadata keeps its project rather than showing a profile card | './server/citation' |
| shared links start on Portfolio despite a saved Journey choice and still allow switching | \|- |
