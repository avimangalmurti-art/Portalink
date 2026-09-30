# Cover thumbnail and shared-profile bundle rollout

Prepared source only. These pending files have not been applied to the hosted
Supabase project. No public bucket, live objects, or existing migration history
were changed by this work. A source review, SQL approval, backfill approval and
application deployment are separate decisions.

## Review and approval order

1. `supabase/pending/cover_thumbnail_schema.sql`: nullable `projects.cover_thumbnail`,
   manifest validation, owner/service-role revision-checked setter, private
   `project-media` cover reads, attachment invalidation and privacy guards.
   Existing `project-media` remains private; existing RLS policies remain in place.
2. `supabase/pending/project_covers_public_bucket.sql`: **separate explicit public
   storage approval**. Creates `project-covers` with WebP-only, 5 MiB object limit;
   adds owner upload/delete and public-visible listing policies, plus upload
   serialization with profile/category/project visibility changes. An existing
   bucket with conflicting exposure/settings is rejected for separate review.
3. `supabase/pending/shared_profile_bundle.sql`: separately approved invoker RPC.
   Requires step 1, but does not require the public bucket in step 2.

Do not apply every historical migration to enable these files. Verify the actual
hosted prerequisites, including the September 28 `storage_path_uuid` helper,
current content/profile fields and RLS. Register any approved applications through
the established migration-history process rather than silently moving pending
files into applied history.

## Contracts and compatibility

`set_project_cover_thumbnail(p_project_id uuid, p_expected_revision text,
p_manifest jsonb) -> uuid` returns the fresh project revision. It is SECURITY
INVOKER, executable only by authenticated users and trusted `service_role`.
Normal callers must own the profile; service-role backfills receive no exception
from public profile/category/project visibility, manifest, source-attachment,
storage-object or revision checks. Null clears a manifest without requiring
public visibility. Keep service credentials out of browser code and `VITE_*`.

The version-1 JSON manifest has only `version`, `bucket`, `sourceAttachmentId`,
`sourceKey`, `frameBaked` and `variants`. The source attachment ID is **text**,
matching the existing attachment table, and must belong to the project.
`sourceKey` is a 64-character lowercase hex fingerprint of source identity,
storage path, selected page and framing. SQL checks its format and project
revision; it does not render the source or recompute the fingerprint.

Exactly three WebP variants have sizes 200, 400 and 800. Each positive integer
width/height pair has the exact corresponding longest edge. All paths use
`PROFILE_UUID/PROJECT_UUID/HASH/SIZE.webp` with the same 64-character lowercase
content hash. The hash represents the generated variant bytes. Originals and
the full project viewer retain their existing storage and reading paths.

Before the schema exists, absence of an own `cover_thumbnail` column in a project
row means retain the existing cover and do not upload thumbnails. When the column
exists but the separately approved public bucket does not, the application can
persist variants in private `project-media`. Its new read policy exposes only
paths referenced by a currently readable, visible project and category, not the
whole prefix. Existing owner and accepted-follower rules remain authoritative.
An old signed private URL remains valid until its normal expiry.

`shared_profile_bundle(profile_id uuid) -> jsonb` returns null for missing/private
profiles even to their owners, otherwise `{profile,categories,projects,attachments}`.
It explicitly excludes hidden projects/categories and never returns account IDs
or owner preferences. Projects include `cover_thumbnail`, `page_count` and the
chosen attachment's `kind` (null for an attachment-free project).
Attachments contain the chosen cover plus at most one first-image fallback;
document rendering metadata contains only the selected page. A viewer must load
full attachments separately. The existing feed RPC uses `to_jsonb(project)` and
therefore includes the new column without another RPC definition.

`sharedProfileBundle.ts` exports the public row types, `SharedProfileBundle`,
`SharedProfileBundleClient`, `parseSharedProfileBundle`,
`isMissingSharedProfileBundleRpc` and `readSharedProfileBundle`. The read result
is `{status:'available',bundle}` or `{status:'unsupported'}`. Only an exact missing
bundle-RPC error permits the legacy reader. Permission/JWT/network/dependency
errors and malformed successful responses remain errors; null is an available
but unavailable-to-public profile, not a reason to fall back.

## Staleness and privacy transitions

Attachment changes invalidate the manifest and revision atomically when the
selected source, fallback selection, source path/kind, selected document page or
cover frame changes, or the source is deleted. Ordinary worker status,
`renderedPages`, playback-processing metadata and display-name changes preserve
the cover. This prevents failed regeneration from leaving stale chosen artwork.

Public object downloads bypass Storage SELECT RLS. Public listing policies alone
cannot enforce later privacy. Before hiding or deleting a project, category or
profile, moving a project into hidden content, or changing ownership, the client
must remove **every public hash under the affected project prefixes** through the
Storage API and clear its manifest. SQL refuses the transition while public
object rows remain. Cleanup failures must leave visibility unchanged.

An anonymous visitor can list Storage object names/paths and ordinary object
metadata (for example size, MIME type, timestamps and cache settings) only for
currently public, visible projects under the new bucket policies. This includes
retained older cover hashes, not just the current manifest. Paths expose profile
and project UUIDs plus content hashes. Knowing a public URL permits downloading
that cover without an account; originals remain in private `project-media`.
See [Supabase public-bucket semantics](https://supabase.com/docs/guides/storage/buckets/fundamentals).

The public object insertion guard also runs for service-role uploads. It holds
shared locks on the project/category/profile while checking ownership and public
visibility; the setter locks the same state. Competing visibility updates or
deletes therefore serialize or abort. A deadlock/revision conflict must retry
from fresh state. Failed publication variants may remain for retry or guarded
prefix cleanup: deleting a deterministic hash after a failed setter could remove
a concurrent publication's winning cover.

Use immutable hash paths and `upsert:false`. Public uploads request
`Cache-Control: public, max-age=31536000, immutable`; private fallback uploads use
private, short-lived caching. SQL configures neither HTTP response headers nor
CDN invalidation. A downloaded or cached public image **cannot be recalled** when
the project later becomes private. The public bucket approval must accept that
constraint explicitly.

## Verification and release gates

`tests/shared-profile-bundle.test.mjs` uses the existing optional PGlite runtime
selected by `PGLITE_MODULE_PATH` (or `PGLITE_MODULE`). It executes the repository
migrations and all pending SQL twice in an isolated in-memory database, then
checks parser boundaries, anonymous/owner visibility, minimal cover metadata,
private cover RLS, ownership, malformed manifests, exact dimensions, revision
conflicts, cover invalidation, public insert restrictions and cleanup guards.
It uses no hosted database, network credentials, Storage objects or backend.

That test does not establish hosted Storage transaction/role behavior, parallel
request timing, signed-URL delivery, CDN headers, browser rendering or real
backfill output. After separate approvals, verify those on explicitly authorized
test records, including a concurrent upload/privacy transition, cleanup failure,
selected PDF/video/image framing and no original-media changes. Do not enable
public uploads until the hosted guard and hide/delete flow are verified.
