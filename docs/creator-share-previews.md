# Creator link previews — Part 2

September 29, 2026. Continues the published Part 1 source in the owned
`logs/mobile-studio-20260929` checkout, branch `codex/creator-share-previews`,
from `1640938`. Initially completed locally; subsequently published at the
user's explicit request as **Sites v272**, source
`80616e17c7a136de2ffba6fba068ad2500e4d258`, on September 29 at
`21:34:20.902559 UTC`. No SQL or separate media-worker release is included.

## Existing implementation and access

The `codex/trust-and-activation` lineage already supplied anonymous public
title/description/canonical lookups; Part 1's base added trusted profile avatars.
Part 2 extends that helper rather than adding another preview mechanism.

The existing project schema and Storage policies are sufficient for the cover
lookup. A bounded live check using only the current publishable configuration
returned HTTP 200 for the anonymous public-project/attachment query and for
signing two eligible public project files. No visitor session, service-role key
or SQL was used, and no credentials, signed URLs or creator content were logged.
This is an access check, not full hosted-worker or private-account certification.

Project media uses the existing **private** `project-media` bucket. Public
projects can be read anonymously through its existing policies. Their URLs must
be signed through that permitted read; fabricating a public-bucket URL would not
work. No storage bucket, policy or persistent object changes are needed.

## Implemented behavior

- HTML-preferred shared requests personalize the SPA head, including creator or
  project title, a description of at most 160 characters, profile/article type,
  canonical URL without query parameters, image dimensions and a large Twitter
  card. Wildcard/absent Accept remains compatible with crawler defaults;
  explicitly preferred non-HTML responses do not trigger metadata reads.
- Profiles use their first visible project's cover, respecting manual negative
  wall positions and otherwise newest-first order. Projects use their own cover.
  The existing chosen attachment takes priority; images or existing rendered
  PDF cover pages must have measured dimensions. Original PDFs, videos,
  multipart files or images without dimensions are not treated as social images.
- Private, missing, hidden, unreadable and no-eligible-cover cases retain the
  unchanged generic tags. Two sampled public PDFs lacked existing rendered
  cover images, so they take that fallback. Part 2 does not generate PDF pages
  or start the separate PDF processing worker.
- A bounded five-minute worker-memory cache is keyed by shared path/origin.
  Current anonymous visibility is checked before every cache hit; changes to
  source metadata, cover identity or shell invalidate that entry. Browser HTML
  remains `private, no-store`, so privacy checks cannot be bypassed by an HTTP
  cache. Signed image URLs use the existing six-hour media lifetime; external
  social-platform caches remain outside the application's control.
- The existing SPA body, WEB/MOBILE components, authentication, D1 actions and
  ordinary navigation remain unchanged. HEAD stays bodyless without optional
  upstream metadata reads.

## Verification

- Independent source/access review found no remaining blockers. The helper
  validates public profile/category/project ownership and image paths, never
  forwards visitor credentials, and uses a two-second total upstream budget.
- **25/25 preview tests** pass, covering head rewriting and unchanged body,
  Accept preference, Unicode/escaping, actual cover dimensions, selected PDF
  pages, hidden/private/missing records, unsafe paths/signatures, first-project
  ordering, the 105-file limit, cache expiry/privacy invalidation, timeout and
  HEAD behavior. Related shared-entry, media-access, saved-page and performance
  checks pass **35/35**: **60 focused tests total**, with no failures or skips.
- Final typecheck and client/server production build pass. Full lint has
  **0 errors and 84 existing warnings**; routine build warnings remain.
- Actual `curl.exe -A "facebookexternalhit/1.1"` and `-A "LinkedInBot"`
  requests to the built worker on local port 5181 returned HTTP 200 for both
  profile and project paths, with correct title/type, 1200x800 fixture cover,
  large card and no generic image. Four requests performed six public reads
  but only two image signatures, confirming reuse by path without skipping
  visibility checks. Making the cached synthetic profile private restored the
  byte-identical generic shell immediately.
- All four crawler response bodies match the built SPA body byte for byte;
  ordinary browser HTML matches the full original shell. The built application
  mounted normally at WEB1280 and MOBILE390/430; its ordinary welcome/guest
  entry and mobile navigation worked, with no console errors or warnings in
  the captured check. No presentation code changed in Part 2; the full share
  UI/auth regression evidence remains in the Part 1 record.

Local crawler probes use synthetic public metadata with the actual built
worker and browser assets, separately from the bounded live anonymous access
check above. They do not establish hosted-worker execution, external
Facebook/LinkedIn card rendering, live authentication or physical-device
behavior. Temporary browser tab and viewport override are cleaned up; the
owned local worker is stopped. Probe fixtures and logs remain ignored.

## Changed files and release state

`src/server/sharedPreview.ts`, the HTML-preference integration in
`src/sites-worker.ts`, `tests/shared-preview.test.mjs`, this record and
`docs/agent-handoff.md`. No dependencies, schema, migrations, auth settings,
Supabase services, D1 data or deployment bindings changed. Part 2 was published
from `codex/creator-share-previews` as Sites v272, deployment
`appgdep_6abc2ed30d548191a3edb5a7aa36e51f`, preserving the public audience and
environment revision 1. Exact source was synchronized to the existing Sites
mirror; no GitHub main push/merge or SQL.

Post-publication checks: homepage HTTP 200 with the matching built client,
normal Home/navigation at WEB1280/MOBILE390/430, and HTTP 200/intact SPA bodies
for both crawler identities on a sampled public profile/project. The sample
had no eligible existing cover and retained generic previews; personalized
image/dimension rendering remains established by the local worker evidence
above. No external social-platform card, physical-device, live-auth mutation
or production privacy-change claim. Verification tab/viewport cleaned up.
