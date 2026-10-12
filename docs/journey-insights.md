# Journey Insights — review package

This task is review-only on `codex/journey-insights`, retaining the References
dependency from PR45 / `5be66a0`. No SQL, migration-history repair, runtime
configuration, merge or Sites publication has been performed. Existing Supabase,
Sites worker/D1 data and production Auth are preserved. Terms PR44 and immediate
session-revocation PR43 are separate and not included.

## Reach preflight and measurement limits

Read-only Sites database inspection confirmed the existing `DB` binding and
`project_reach_daily` table are live and populated: **80 daily rows for 20
projects**, September 30–October 12, 2026, at inspection time. Columns are
`project_id`, `day`, `opened`, `finished`, `max_page_hist`, `ref_counts`. The
existing insert/advance triggers update daily aggregates atomically. A nightly
rollup or replacement table is not needed and has not been added.

`opened` counts distinct project/day/session hashes, not raw progress beacons.
The existing session is an anonymous, memory-only tab token; reload creates a
new tab session. This is not a unique-person or fraud-resistant count. The app
already disables the collector for known owners. This task also rejects verified
signed-in owner beacons at the worker before a D1 write. A signed-out visitor
cannot be identified as the creator without new tracking; no such tracking has
been added. Historical anonymous rows cannot be retrospectively attributed.

The histogram supports a weighted **median furthest page reached**, not a count
of distinct pages opened. Insights uses that existing measure and the row card
labels it explicitly. `page_timings` records loading latency and has no
per-project dwell duration. **Time on page remains null / “—”**; loading speed
is never presented as reading time. The user explicitly confirmed using median
page reached and showing “—” for time on page. Reads describe available daily history (existing
retention is approximately 13 months), rather than fabricated lifetime totals.

## Interface and public isolation

Only the owner's Journey gets Record · Insights. Record is the default and
renders the original `JourneyView`. The original public Journey component and
styles are unchanged. The main profile component changes only its deferred
Journey import to the authenticated owner wrapper; no profile controls or layout
are redesigned. Insights renders the same chronological project/citation
timeline with its strip and quiet right-aligned metrics. Neither reads nor
citations rank or reorder any other view.

The whole-record series uses made-on months for work and received dates for
citations. Missing intervening months are real zero-count months. Field shares
use each work's portal/year with stable portal colors and labels. Quarterly
references include both Portalink outgoing citations and external references by
their created dates. The monthly strip is horizontally scrollable when needed
to keep bar tap targets comfortable; all record months are included. A bar tap
lands at its timeline month below the current fixed profile header.

Row tap opens a small card with the same five metric groups and 12 UTC
Monday-based weeks of reads. Missing weeks have gaps, not interpolated invented
values. A work without recorded reads/citations/references shows “—”; a known
made-on date still supplies days since made. A creator with one work gets its
one-month bar and the requested growth line.

Owner modules are loaded only by the main-app owner path. Tests assert the
visitor's full static/dynamic source-module set matches the pre-task build,
owner Insights modules/field names/endpoint are absent from visitor and cite
graphs, shared-profile serialization and cite renderers have no new fields, and
the public Journey's HTML snapshot is identical. Emitted content hashes and
cross-chunk export aliases can change with a rebuild; byte-for-byte filenames
are not claimed. The measured complete visitor closure differed by 14 bytes of
bundler bookkeeping, with the same 783 modules and no Insights code/data.

## Owner API and cache

`GET /api/insights?profile=<uuid>` uses the existing worker's Supabase JWT
verification and checks the canonical profile/account relationship on **every
request**, including cached responses. Other accounts receive 403, signed-out
callers 401. All Supabase reads carry the verified request's bearer token and
existing RLS. No service-role key or new backend is introduced.

The response contains monthly series, yearly portal shares, quarter lines and
per-project numbers. Existing Supabase sources paginate; opaque image/page
citation mappings are batched and constrained to owned projects. Reads query
only `project_reach_daily`, in bounded project batches. The endpoint never scans
or counts raw reach events or RUM beacons. Histograms are combined as weighted
observations, rather than averaging medians. Missing sources fail closed with
503 instead of invented zeroes.

The named worker cache stores responses under origin/account/profile keys for
ten minutes. Ownership and JWT verification precede cache reads. Cache failures
or malformed entries fall back to an authorized fresh read. Outward responses
are always `private, no-store` with `Vary: Authorization`; the internal cache
key has no public serving route. Client loads abort/discard late results and
recheck account identity before displaying a result. Changing account or profile
resets the owner view to Record.

## Activation and verification

There is **no new Insights migration**. Production activation depends on the
unapplied single `supabase/pending/external_references.sql` from PR45. That file
still needs its own explicit approval. Do not apply all migrations or activate
the unrelated Portfolio PDF web process merely to enable Insights. Apply only
the approved dependency, merge reviewed source through the agreed flow, and
publish only after approval. The new endpoint is not on Sites379 yet.

Focused tests cover three-year series, weighted medians, 403/401, canonical
ownership on cache hits, ten-minute expiry, batched citation mappings, missing
sources/cache failures, own-visit exclusion, distinct session/day rollups,
unknown “—”, row tap/card/sparkline, actual month anchors/header offset,
public snapshot and bundle isolation, and no ordering by reads. Typecheck,
client/worker builds and main/visitor configuration guards pass; lint has zero
errors and 121 warnings. **All 1,713 Node regression tests pass, zero failures or
skips**, including the existing database checks. The final receipt is in
`logs/journey-insights-full-tests.txt` and the task handoff.

Browser evidence uses the **actual app root/components with synthetic services
and transport**, without production writes. Mobile 420×912 and desktop 1280×900
were inspected; the 390px supplementary check showed no horizontal overflow.
Record, Insights, row card and one-work empty state are captured in
[the evidence gallery](evidence/journey-insights-20261012/README.md). This is not
physical-iPhone testing or proof of a deployed authenticated Insights endpoint.
