# Official Portalink domain

User authorized connecting `portalinknetworks.com` to the existing live Portalink app on16October2026, while keeping controlled tests and held Google sign-in/SQL work on hold.

Existing Sites project: `appgprj_6a9273ef43f8819198e0878a0020ad91`. Custom-domain ID: `appgdom_6ad263c4f2cc8191aeedd70f98778ec1`. Domain targets the existing worker/site; no app rebuild, deployment, access change or backend replacement was performed. Existing live release remains439.

## DNS changes

Added only the four records supplied by the native Sites tool through the owner's existing Cloudflare dashboard:

| Type | Name | Value / purpose |
| --- | --- | --- |
| A | @ | 162.159.143.30 (DNS only, Auto TTL) |
| A | @ | 172.66.3.26 (DNS only, Auto TTL) |
| TXT | _openai-site-verification | Native Sites ownership-verification value |
| TXT | _cf-custom-hostname | Native Cloudflare hostname-verification value |

The initial zone contained8 records:5Google MX, root SPF, root Google site verification and Google DKIM. None was edited/deleted; final table has12records. No existing web A/AAAA/CNAME record conflicted. Full-zone DNS remains in place; no nameserver, SSL-mode, mail, Google Cloud/Workspace or Supabase provider settings were changed. Only the requested apex hostname was attached; www was not separately configured.

Initial native refresh: provider hostname active; overall pending; HTTPS pending_validation, no last_error. Final certificate/routing verification is recorded below when available. DNS verification tokens are public DNS data but are omitted from this prose; inspect existing records rather than minting replacements. Screenshot: ignored logs/custom-domain-20261016/dns-records.png.

Controlled publishing/recovery scope/operator/cleanup approvals remain in principle only. Fault-control approval is still pending, and scheduling/execution remain on hold. No SQL, Auth hooks, Google OAuth configuration or credentials changed. Supabase Auth redirect behavior on the new origin has not been tested or adjusted; attaching a domain does not establish OAuth readiness or migrate browser sessions. Original chatgpt.site address remains available.

## Completed connection

At2026-10-16T17:53:32.505853Z (10:53Pacific), native refresh reports overall **active**, provider **active**, SSL **active**, no last_error. Initial visit during active_redeploying briefly returned No site here; after terminal activation, reload served Portalink successfully over HTTPS. Guest Home and same-origin navigation links render at `https://portalinknetworks.com/`; captured console0errors0warnings. No sign-in, upload, draft, account mutation or controlled recovery test was performed. Browser session on the old hostname remains untouched; authentication does not automatically transfer between origins.

Official-domain tab76 retained as the user-facing result; temporary Cloudflare tab75 closed. Screenshot: ignored `logs/custom-domain-20261016/official-home.png`. Original chatgpt.site address remains usable. No www alias/redirect or Auth redirect allowlist change was made. This is a hosting/domain change, not a new application source release or an authorization to resume tests.
