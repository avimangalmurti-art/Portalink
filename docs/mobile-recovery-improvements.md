# Mobile navigation and recovery

## WEB upload recovery extension (2026-10-22)

The user subsequently authorized durable upload recovery on WEB too, after live
testing found that a fresh WEB reload lost its session-only file queue. This
extension reuses the same account/profile/draft-scoped IndexedDB file workspace
and authenticated resumable upload transport on both presentations. WEB keeps its
existing dialog, Journey entry, location/profile-refresh behavior and Studio
availability. New idea offers the existing explicit Continue draft action for
ordinary saved WEB work. Closing saves dirty work; explicit Discard removes it.
Storage failures keep the publisher available with an error and Retry save.

Recovery is on the same browser and origin, subject to browser storage capacity
and the existing upload-handle expiry. It does not synchronize local files across
devices, promise offline startup, or keep transfers running while the OS suspends
the browser. The original MOBILE-only boundary below describes the first release;
its statements about ordinary WEB transport are superseded by this extension.
Optional checkpoint flags preserve an untouched inferred location, an explicit
location and the creator's location opt-out. Older MOBILE records retain their
existing restore behavior. No new IndexedDB version or server schema is needed.

Verification:132 focused cases, six emitted-entry checks, typecheck, full lint
(zero errors/111 existing warnings), configured production build and independent
source review pass. Actual-App browser checks with fictional services and real
IndexedDB pass WEB reload and explicit Continue draft with identical file hashes,
order, cover, Private metadata and draft ID; MOBILE420x912 reload and both resize
directions retain the same workspace. Safe Close and explicit Discard pass.
Light/dark WEB forms retain their layout and scrolling. These checks make no
production writes and do not establish live positive-offset transfer continuation.
Publication is pending explicit approval of the standard Sites credential transfer;
current live507 still has the earlier MOBILE-only durable-recovery boundary.

Scope: MOBILE/PWA behavior, preserving existing WEB presentation and workflows.
Implementation starts from published Sites 504 source `0970dad3` on isolated
`codex/mobile-navigation-recovery`, created from fresh `github/main` and retaining
the published descendant. The onboarding design checkout is not modified.

The first implementation covers the duplicate Portals Back step, bounded
account-scoped destination and message-draft restoration, and interrupted upload
recovery. It does not add offline caching, device push, a native client, backend
configuration, migrations, or deployment. Upload recovery does not promise
background execution while iOS suspends the browser.

## Implemented behavior

- The mobile category chooser returns through its observed browser history to
  the actual Portals/profile opener. History traversal is capped at 32 entries,
  checks committed keys/indices/URLs and stays within the same category/profile.
  Reader Back, direct-link fallbacks and WEB navigation retain their behavior.
- Cold mobile root launches can restore a conversation or an enumerated Studio
  section. Explicit incoming links, authentication callbacks and recovery flows
  remain authoritative; no search text or action-bearing URLs are restored.
- Unsent mobile message text is local to the account and conversation, with a
  24-hour lifetime, 20-draft limit, 8,000 characters per draft and 65,536 serialized
  characters per record. Attachments and message history are not persisted.
  Existing profile-scoped session drafts migrate safely. Confirmed sign-out or
  account changes clear the old account's mobile copies; token refresh preserves
  them. Successful sends/retries retire only the matching revision, including
  after MOBILE/WEB resizing. Ordinary WEB keeps its session-storage/pre-send
  clearing behavior.
- Saved mobile publishing flows opt into upload recovery. Every byte contributes
  to a bounded-memory file identity, and the same saved file reuses its storage
  path. Completed objects/parts are checked through authenticated Storage before
  skipping bytes. TUS resumes server-confirmed offsets using the installed
  client; fresh WEB openings retain the existing transport.
- Cleanup references must be durably checkpointed before recoverable transfers
  start. Failures retain tracked paths for retry/discard; replaced paths must
  finish cleanup before publishing. Account changes, reset/unmount and responsive
  transitions are guarded against late callbacks. No automatic publication is
  introduced.
- Recovery handles live in dedicated account/path-scoped IndexedDB with a
  23-hour validity window and bounded records. Only the configured HTTPS Storage
  resumable endpoint is accepted. Authentication headers and signed viewing URLs
  are not stored in these handles. Lifecycle suspension preserves resumable
  handles; explicit Cancel uses authenticated TUS termination and tracked cleanup.

## Verification

371 focused cases across 29 affected test files passed. The final 14-case upload
suite also passed after the last opening-latch adjustment. Typecheck, full lint
(zero errors, 111 existing warnings), production client/worker build, configured
main/visitor bundle guards and six emitted-entry checks passed. Independent
navigation/upload reviews found no remaining blockers after their reported
issues were corrected. Final source/test hashes are recorded in ignored
`logs/recovery-source-hashes.json`.

Actual App/bootstrap browser checks used fictional accounts/services with the
connected backend blocked, at MOBILE 420x912 and WEB 1280x900. Mobile cold PDF
scrolling reached 1,824px/page 5, then Back returned through the chooser and
original collection to an interactive profile without the extra step. Conversation
and Studio cold resume, failed/successful sends, session refresh/account isolation
and MOBILE-to-WEB-to-MOBILE draft retirement passed. WEB startup ignored mobile
resume state; its reader/profile return, scrolling and message behavior remained.
Real browser IndexedDB retained an upload handle and file identity across reload
and removed it on explicit local cleanup. These checks transferred no files and
made no production account/content writes.

The TUS integration cases execute the installed client against a fake HTTP stack,
including interruption, HEAD-offset resume, remaining PATCH bytes, cancellation
and authenticated DELETE. They do not establish live Supabase transfer behavior.
Physical iPhone suspension, OS keyboard/gestures and production upload writes
remain unverified. Offline startup, push notifications and native capabilities
are separate work. No deployment, SQL, backend/Auth configuration, dependencies,
public media helpers or Sites worker/D1 changes were made.
