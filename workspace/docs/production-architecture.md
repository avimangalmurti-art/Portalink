# Portalink production architecture

Portalink is built for staged growth toward global scale. “Built for scale”
means preserving replaceable boundaries and measurable behavior from the first
release; it does not mean provisioning billion-user capacity before demand.

## Non-negotiable invariants

1. Production fails closed. A deployed build never substitutes prototype users,
   projects, analytics, sessions, commerce records, or generated output.
2. Every externally retried mutation is idempotent. Upload completion,
   publication, engagement, messaging, notifications, and background jobs use a
   stable request or entity key and can be replayed safely.
3. Interactive requests are bounded. Feed, search, project, conversation, and
   notification reads use cursor pagination and never enumerate an entire table.
4. Media work is asynchronous. Originals are immutable; validation, PDF page
   rendering, image derivatives, video/audio transcoding, metadata extraction,
   and moderation run from durable queues.
5. Databases store authority, not delivery payloads. Object storage holds media;
   CDN URLs and derivatives are selected for the surface and viewport.
6. Authorization is enforced at the data and service boundaries. Client state
   only improves UX and is never the security control.
7. All state transitions are observable. Requests and jobs carry correlation
   identifiers; success, latency, retry, queue age, and failure reason are
   measurable without reading a user's private content.
8. User-facing counters are derived asynchronously. Viral writes never contend
   on a single project/profile row.
9. Data can be partitioned by stable identifiers. Account, profile, project,
   conversation, notification, and media keys must not depend on a display name
   or a deployment region.
10. Privacy, deletion, reporting, blocking, moderation, rate limits, abuse
    controls, and audit trails are product requirements rather than later add-ons.

## System boundaries

- Web client: presentation, local interaction state, resumable direct uploads,
  and typed calls to versioned service contracts.
- Edge/API: authentication, request validation, idempotency, rate limits,
  pagination, read aggregation, and mutation commands.
- Primary data: accounts, profiles, projects, graph edges, conversations, policy
  state, and durable job records.
- Object storage/CDN: immutable originals plus versioned thumbnails, responsive
  images, rendered pages, and streaming derivatives.
- Workers: media processing, moderation, notification fan-out, indexing,
  analytics events, and cleanup. Workers claim leases and tolerate replay.
- Derived systems: search index, feed candidates, counters, analytics warehouse,
  and recommendation features. None is the sole authority for user content.

## Growth gates

Traffic increases only after the preceding gate meets its service objectives.

| Gate | Required evidence |
| --- | --- |
| Invited alpha | No fixture data in production; backups restored in a drill; upload and deletion paths verified; error monitoring active. |
| 500 DAU | Cursor pagination, thumbnail delivery, per-account quotas, report/block flows, queue dashboards, and rate limiting. |
| 5,000 DAU | Server-owned feed candidates, search indexing, media CDN policy, load tests, on-call runbooks, and moderation operations. |
| 25,000 DAU | Read replicas/caching where measured, event pipeline, notification fan-out workers, cost dashboards, and failure injection exercises. |
| 100,000 DAU | Capacity headroom of at least 3x measured peak, regional disaster recovery, abuse automation, security review, and staffed incident response. |
| Beyond | Partition and multi-region decisions follow observed hot keys, locality, consistency needs, and unit economics—not forecasts alone. |

## Initial service objectives

- Availability: 99.9% for public reads and authenticated core actions.
- Home feed API: p95 under 500 ms excluding media transfer.
- Project metadata API: p95 under 300 ms.
- Upload acknowledgement: p95 under 2 seconds after object storage accepts the
  bytes; processing remains asynchronous.
- Queue age: p95 under 60 seconds in normal operation.
- Recovery point objective: 15 minutes or less for authoritative records.
- Recovery time objective: 60 minutes or less for the first public beta.

These are launch objectives, not permanent ceilings. They must be measured in
the production environment and tightened as the platform and team mature.

