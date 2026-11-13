# Portalink production release

Verified on 2026-11-13. The [Portalink production site](https://portalinknetworks.com/) runs Sites 624. The homepage and [public Portalite catalogue](https://portalinknetworks.com/portalite) returned HTTP 200.

| Sites version | Git commit | Use |
| --- | --- | --- |
| 624 | [`1fe45038300010b1d69925dc375864281a401e55`](https://github.com/avimangalmurti-art/Portalink/commit/1fe45038300010b1d69925dc375864281a401e55) | Live web release. Adds editing, deleting, and reordering Then/Now pairs. |
| 623 | [`f63fad32a380d484286ab6fc387866fb43333afc`](https://github.com/avimangalmurti-art/Portalink/commit/f63fad32a380d484286ab6fc387866fb43333afc) | Previously published web version and rollback target. |

Sites confirmed successful publication for both versions. [PR #169](https://github.com/avimangalmurti-art/Portalink/pull/169) tracks the live feature, and [Quality run 43480068071](https://github.com/avimangalmurti-art/Portalink/actions/runs/43480068071) passed all five jobs for the published commit.

Sites 624 uses these two applied Supabase migrations:

- [`20261113193355_profile_timeline_pair_edit.sql`](../supabase/migrations/20261113193355_profile_timeline_pair_edit.sql)
- [`20261113194228_profile_timeline_pair_order.sql`](../supabase/migrations/20261113194228_profile_timeline_pair_order.sql)

The live ledger matched both checked-in SQL files byte for byte. Read-only production checks confirmed the edit policy and column grant, the order table and its three policies, the ordering RPC, and the legacy cleanup trigger. The previously approved rollback-only test verified editing, deleting, and reordering and confirmed removal of its temporary data. See [migration status](migration-status.md) for SQL checksums and test details.

Rolling back the web release means selecting Sites 623. The two additive migrations can remain applied. See the [database migration register](migration-status.md) for the historical SQL restored to the local replay sequence and the separate hosted ledger review.
