# Portalink production release

Verified on 2026-11-13. The [Portalink production site](https://portalinknetworks.com/) runs Sites 628. The homepage and [public Portalite catalogue](https://portalinknetworks.com/portalite) returned HTTP 200, 110 assets matched the build, and a direct public Portal link opened its chooser in the desktop browser.

| Sites version | Git commit | Use |
| --- | --- | --- |
| 628 | [`b6c7854c497a5b649c0d1fee0dbf61abc05388b6`](https://github.com/avimangalmurti-art/Portalink/commit/b6c7854c497a5b649c0d1fee0dbf61abc05388b6) | Live web release. Publishes seven public Portal and mobile improvements. Multi-Portal project placement was enabled separately in Supabase. |
| 626 | [`79333ad96615461f66b17c62df6e95a640823140`](https://github.com/avimangalmurti-art/Portalink/commit/79333ad96615461f66b17c62df6e95a640823140) | Previous live version and web rollback target. Removes unused source and four assets and standardizes mobile reorder controls. |
| 624 | [`1fe45038300010b1d69925dc375864281a401e55`](https://github.com/avimangalmurti-art/Portalink/commit/1fe45038300010b1d69925dc375864281a401e55) | Then/Now editing, deletion and ordering release. |
| 623 | [`f63fad32a380d484286ab6fc387866fb43333afc`](https://github.com/avimangalmurti-art/Portalink/commit/f63fad32a380d484286ab6fc387866fb43333afc) | Previously published web version and rollback target. |

Sites deployment `appgdep_6af7b9eb1dc0819194779564323da069` succeeded with public access and runtime revision 2. The 662-file archive preserved all four existing D1 SQL payloads. All five [Quality jobs](https://github.com/avimangalmurti-art/Portalink/actions/runs/43540304588) passed for the source in [PR #172](https://github.com/avimangalmurti-art/Portalink/pull/172), which remains open. Sites 627 was saved but never deployed.

The approved multi-Portal migration was applied to Supabase separately from the Sites deployment. Production recorded [`20261114013655_project_portal_features.sql`](../supabase/migrations/20261114013655_project_portal_features.sql) and its SQL matched the reviewed file byte for byte. On live Sites 628, the signed-in Portalite owner opened **Feature in Portals** through the project menu, selected another Portal, and confirmed that Save was enabled. Cancel cleared the selection without a write.

Sites 624 uses these two applied Supabase migrations:

- [`20261113193355_profile_timeline_pair_edit.sql`](../supabase/migrations/20261113193355_profile_timeline_pair_edit.sql)
- [`20261113194228_profile_timeline_pair_order.sql`](../supabase/migrations/20261113194228_profile_timeline_pair_order.sql)

The live ledger matched both checked-in SQL files byte for byte. Read-only production checks confirmed the edit policy and column grant, the order table and its three policies, the ordering RPC, and the legacy cleanup trigger. The previously approved rollback-only test verified editing, deleting, and reordering and confirmed removal of its temporary data. See [migration status](migration-status.md) for SQL checksums and test details.

Rolling back Sites 628 means selecting Sites 626. The additive Then/Now and multi-Portal migrations can remain applied. See the [database migration register](migration-status.md) for the historical SQL restored to the local replay sequence and the separate hosted ledger review.
