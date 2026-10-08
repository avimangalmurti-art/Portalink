# Portalink MCP — pending review

Connector URL after an approved deployment: `https://portalinknetworksinc.avimangalmurti566055.chatgpt.site/mcp`.

Claude: Settings → Connectors → Add custom connector → paste that URL. [Official instructions](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

ChatGPT: Enable developer mode, then Settings → Apps → Create app → paste that URL; workspace permissions/plan availability may apply. [Official instructions](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt).

Any Streamable HTTP MCP client: connect to that URL without Portalink credentials. Discovery is `/.well-known/mcp.json`. The worker does not require user authentication for MCP data. Hosting-boundary anonymous connector behavior must still be checked after the approved deployment; the existing public Site/access settings are unchanged.

## Data and privileges

`search` and `fetch` use the existing publishable key and SECURITY DEFINER, citable-only read RPCs. Search sorts by text relevance, made-on date, then stable identity/order; no engagement metric is involved. Search/fetch never create a receipt. Item identifiers remain page UUIDs or opaque attachment citation UUIDs. Search uses the ChatGPT results envelope; its text contains precisely the requested attribution metadata. Fetch uses the ChatGPT document envelope with structured metadata, plain citation, BibTeX and CreativeWork JSON-LD.

Only `cite` records an external usage receipt; it cannot create, edit or delete projects, portals, pages, profiles or uploaded files. It is accurately annotated as a write to receipt data, with destructive=false; readOnly=true would misrepresent its notification effect. It returns the citation block. Anonymous external events have no citing account/project and cannot be edited by ordinary users. Creator-side Cited, public counts and incoming Journey support these events. Existing human app citations/deferred notifications remain intact.

Pending SQL: `supabase/pending/202610080002_external_citations_mcp.sql`. Requires the three applied citation migrations. Apply only after review. No Storage policy, bucket/object, D1 or Auth change. Runtime private secrets: `MCP_SERVER_KEY` (Supabase server-side service-role key) and `MCP_IP_SALT` (stable random HMAC salt). Never put either in VITE variables, build artifacts, logs or committed configuration. The server key is used only for rate-limit and external-receipt RPCs; media signing always uses the anonymous publishable key and the existing Storage SELECT policy. Missing secret/IP fails closed with 503.

The host-supplied `CF-Connecting-IP` is HMAC-SHA256 hashed. No raw IP is retained. Database advisory locks serialize the rolling 60-request/minute budget across worker isolates, and the per-IP/item ten-minute dedupe window. Private rate/dedupe tables have RLS and no browser role grants. Old throttle data is pruned during requests; dedupe links cascade when citation receipts are removed. Browser CORS allows anonymous clients; Origin values are validated, request bodies bounded, and upstream calls time out. Stateless JSON Streamable HTTP, initialization, notifications, tools and resources are exercised by the official SDK. GET returns 405 because there is no server-initiated SSE channel.

Full-size media uses the existing anonymous signed path with 3600-second validity. A PDF page without a rendered image returns the actual project cover and rendered=false. A missing cover is null, never invented artwork. The public 400px cover pipeline is reused. An existing anonymous Storage denial is an error, never bypassed using the server key. Confirm anonymous signing on real production items before release; do not broaden Storage policy as a workaround.

## Verification

The official MCP SDK 1.26.0 ran against the actual handler over a local HTTP socket. Its backend was PGlite with synthetic data, not production. [Recorded transcript](mcp-client-transcript.md). Database tests apply all four migrations only in that disposable in-memory fixture. No real production rows were created, changed or deleted by this task.

Repeat the client run using an isolated SDK install, with `PGLITE_MODULE_PATH` pointing to its PGlite dist/index.js and `MCP_SDK_PATH` to the SDK dist/esm directory: `node scripts/verify-mcp-client.mjs`. SDK/PGlite are test tools and are not added to app dependencies. Full suite uses the repository runner and its existing PGlite setup.

Production E2E remains unfinished: approved SQL application, private secret setup, approved deployment; anonymous real-client search damping → fetch a page/image → cite with context → creator sees one Studio notification/Cited row, Journey/count, repeat dedupes. Confirm fallback covers and anonymous connection through Sites hosting too. This task does not authorize any of those deployment/database mutations. No publish has occurred.

## Suite comparison

Normal-permission full Node suite: baseline 1603/1603 pass, 0 fail/skip; MCP branch 1613/1613 pass, 0 fail/skip. Baseline checkout ace69fb has identical source/tests/build configuration to github/main 0360a8b; `git diff` confirms only an eight-line handoff receipt differs. Ten new cases cover MCP transport/permissions/dedupe/media/creator views. Existing test assertions remain unchanged; explicit non-MCP import boundaries were added to media/share fixtures. A later strengthened cover-fallback assertion and creator/transport focused run passed all seven cases. Sandbox-only Git-fixture failures occurred on both baseline and branch; normal-permission runs above resolve them without test changes/skips.

Typecheck passes. Lint: 0 errors, 111 pre-existing warnings (no new warning). Final client/worker production-configured build passes; both emitted main and visitor module graphs contain the configured Supabase host/publishable key, and both build-time variables are guarded. No server key/salt was configured or bundled. Local official SDK run passes. No browser/mobile physical-device or hosted connector/Studio acceptance claim.
