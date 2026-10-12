# Terms sheet visual evidence — 2026-10-12

Reference: the user's `Portalink-terms-sheet.pdf`, one page containing three boards. Screenshots are from the actual local React app frontend, with only account/legal services simulated in ignored QA fixtures. No mock screenshot images replace the UI. No production SQL or email calls were made.

| Reference board | Screenshot | State |
| --- | --- | --- |
| 1 | `board-1-top.jpg` | Title, email pill, four agreement rows, legal text, sticky actions |
| 2 | `board-2-scrolled.jpg` | Scrolled legal content; header and footer remain fixed |
| 3 | `board-3-content-licence.jpg` | In-place C reader with Private/Public/Citable card first |

All three use the primary mobile viewport, 420 × 912 CSS pixels. A 1280 × 900 desktop preview confirmed a centered 640px sheet, reachable footer and no horizontal overflow. Required browser Back and Escape preserved the open reader. Settings' actual Terms row reopened the read-only sheet with accepted versions/times and Done; `settings-read-only.jpg` captures that state. The unavailable email result disabled the pill with “Email not available yet.” No console errors were captured in these local flows.

These screenshots establish actual browser layout, not physical-phone testing, live confirmation/delivery, deployed database state or active MCP compatibility. Production rollout and verification remain subject to approval.
