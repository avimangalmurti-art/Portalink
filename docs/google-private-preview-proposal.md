# Private Google test preview — concrete configuration proposal

Status: REVIEW ONLY; no address reserved, Site created, DNS changed, secret supplied, client configured, deployment made or test scheduled. Execution remains on hold. This proposal is subject to reviewing supported hosting/access/logging behavior; it does not assert that these controls are already active.

## 1. Proposed address and hosting boundary

| Item | Proposed configuration |
| --- | --- |
| Preview name | Portalink — controlled Google sign-in test |
| Canonical origin | `https://google-test.portalinknetworks.com` |
| Google authorized redirect URI | `https://google-test.portalinknetworks.com/api/auth/google/callback` |
| Start endpoint | `POST /api/auth/google/start`, same-origin JSON only |
| Capability endpoint | `GET /api/auth/google/capability`, private and no-store |
| Callback | `GET /api/auth/google/callback`, top-level browser navigation |
| Completion asset | `/google-auth.html`, private; dynamic token-bearing completion returned only by the callback |
| Runtime access | Separate owner-private Sites project, using Sites/ChatGPT authentication at its edge |
| Application backend | SAME existing Portalink Supabase project; no new Supabase instance, accounts namespace, database or Storage |
| Existing public project | Keep its ID, audience, deployed version, environment and D1 data unchanged |

The literal origin/URI above are proposed review values only, not entries in application or production configuration. DNS occupancy, domain attachment, TLS and native private-access support for this custom hostname have not been verified. No CNAME target or generated Sites address is invented: use only server-returned values after separately authorized registration/attachment.

Read-only hosting inspection in this preparation confirmed the existing Site is public, owner-controlled, has no current preview URL and has no attached custom domains. Sites deployments are production URLs, and environment values are project-wide. Therefore do not deploy the candidate or set its privileged test secrets on the existing public Site as a “preview.” A separately authorized private test Site would be a separate hosting runtime only; it does not replace the product or its backend. Its opaque ID must be returned by Sites and stored only in a separate test checkout/configuration after approval; preserve the canonical `.openai/hosting.json` in the existing project.

If Sites cannot enforce owner-private access on the proposed custom domain, stop and review using its server-returned private generated origin instead. That would require a NEW exact origin/callback review before any Google registration. Do not make the Site public, proxy around authentication, or attach the hostname to the current public Site to force the proposal to work. Creation, deployment, private audience, DNS and TLS attachment each remain separately gated; a private deployment is still an external deployment.

## 2. Access controls: two independent checks

**Outer gate: Sites owner identity.** Initially allow only the current Site owner/operator through supported owner-private access. No workspace-wide audience, groups, external visitor invitations, service-token links or shared password. Avinaash can test multiple owner-controlled Google identities inside the same authorized Sites-owner session; Google account selection does not itself authorize a new viewer of the preview. Any later human tester needs separately approved Sites access and application enrollment. Preserve the Sites identity integration; do not add a competing preview-login stack.

**Inner gate: admitted application identity.** The existing candidate checks US/18+ self-declaration, reviewed bundle acknowledgment, state/browser binding, PKCE, nonce and verified Google identity. The testing-stage SQL admits only independently verified allowlisted Google subjects. Sites ownership alone does not admit a Google identity; Google identity alone does not grant Sites access. The bundle approved in principle is `portalink-controlled-test-2026-10-15-v1`; the actual test configuration remains unset until separately authorized.

| Surface | Required access rule |
| --- | --- |
| HTML, JS/CSS, assets and ordinary application paths | Outer owner gate on the preview |
| Capability/start | Outer owner gate; start also requires exact Origin and same-origin request checks |
| Google callback | Outer owner gate AND existing state/browser-cookie/identity checks; NO public callback exemption |
| Completion asset and token-bearing HTML | Outer owner gate; callback-generated payload, no-store, no-referrer and restrictive CSP |
| Generated Sites alias, custom hostname and any exposed worker origin | Same owner gate; no alternate public route to this runtime |
| Direct Supabase Auth endpoints | Shared-project signup hook and tested admission rules; a private hostname is not a boundary around Supabase APIs |

The callback must stay at `/api/auth/google/callback`. Sites reserves `/callback` for its own authentication; do not replace or reuse that route. Never expose `OAI-Sites-Authorization` or a Sites bypass token in browser code, a query string, Google settings, test instructions or logs.

### Callback through the outer gate

1. Operator signs into the owner-private preview with Sites/ChatGPT at top level before beginning an application test. Verify the correct private hostname and owner session in each test browser/profile. Refresh the outer session shortly before the window rather than changing its security settings.
2. The preview performs screening and acknowledgment, then posts to its own start endpoint. The server binds the handoff to the host-only `__Host-portalink-google` cookie (Secure, HttpOnly, SameSite=Lax, ten-minute expiry).
3. The browser navigates to Google, then back to the exact canonical callback. Owner access must already cover that top-level GET. Sites must preserve the application host/path and required callback parameters and let the server validate the browser binding.
4. If the outer session expires or a different user reaches the callback, deny/restart the attempt; do not open a callback bypass. Verify whether any Sites reauthentication retains sensitive query parameters or sends them to logs/another origin. Unacceptable forwarding or inability to preserve the gate is a NO-GO, even if it makes the test inconvenient.
5. Successful application completion uses the existing Supabase SDK and returns to the same preview origin. The current app callback removes code/state from browser history early and never puts Supabase tokens in the URL. Sites' own redirects, errors and logging still require independent verification.

## 3. Google client proposal

Use the existing organization-owned Google Cloud project, with a dedicated **Web application** client proposed name “Portalink controlled Google sign-in test.” Confirm whether an appropriate client already exists before proposing creation. Actual client ID and secret remain absent from source and this document. Owner-led credential creation/entry requires separate authorization; use no personal development project for this runtime.

The sole proposed web redirect is the exact URI in section 1, with no wildcard, alternate public Site, localhost, fragment or trailing slash. Google requires an exact authorized redirect match. This server-code flow does not require adding unrelated JavaScript origins or One Tap configuration; if an interface requires an origin, review only the canonical preview origin. The provider form's ordinary Supabase callback is not a substitute for this first-party callback.

Request only `openid email profile`, retain PKCE and nonce checks, and do not request offline access or Gmail/Drive/Contacts permissions. The same dedicated client must be accepted by the existing Supabase Google provider during the approved test window. Current provider credentials were empty at preflight; this proposal supplies none.

Review the project's current consent audience/status, branding, test-user handling and any existing clients before any change. Propose non-public/testing configuration where supported and appropriate, with only the owner-controlled fixture accounts; do not rely on Google's test-user list as the application allowlist. Google documents special behavior for basic identity scopes, so independently enforce the application subject allowlist. G3 must reach the application rejection boundary without being granted application admission. Any project-wide consent change needs its own exact review. The in-app test agreement does not authorize publishing public legal pages or entering invented Terms/Privacy URLs into Google.

## 4. Secret handling and bindings

| Name | Classification and proposed handling |
| --- | --- |
| `AUTH_PUBLIC_ORIGIN` | Runtime configuration: exact canonical origin in section 1; not a credential |
| `GOOGLE_CLIENT_ID` | Runtime client identifier from the reviewed test client; visible by protocol in Google's authorization URL, but never hard-coded or committed |
| `GOOGLE_CLIENT_SECRET` | Server-only secret in private-preview Sites runtime secret storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged credential for the EXISTING project, configured only after explicit approval of that access |
| Existing `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing public browser configuration; same project. Keep production/local environment safeguard and bundle checks; never put privileged keys in VITE variables |
| Sites owner identity | Platform-managed; no copied login cookies or browser bypass tokens |
| `DB`, R2 and PDF/export credentials | Do not provision a new D1/R2 backend, copy data or configure export credentials for this Google-only test |

Use native Sites runtime configuration with secrets marked secret (and any platform-required stricter treatment). Configure preview variables on the NEW private runtime only, never on the existing public project or shared source manifest. Owner enters values in the approved secure interface; do not paste them into chat, source, shell arguments, screenshots, reports or committed files. Check presence/secret classification without revealing values. No secrets are requested or read in preparing this proposal.

The existing service-role credential is broad and can bypass RLS: it is NOT narrowed by a private preview, UI allowlist or service-only RPC. Accept that production-backend privilege only after explicit review; restrict runtime editing to the owner and use the fixed server endpoints. If acceptable least privilege cannot be established, stop to review a different server credential design rather than declaring this key scoped. Do not create a key, expand permissions or rotate a shared key as a convenience. At test exit, restrict/disable preview access and revoke only independently scoped access when possible; shared-key rotation could affect live services and requires a separate plan.

For the proposed separate test runtime, omit D1/R2 bindings rather than creating empty substitutes. Current worker source explicitly reports page-interaction functionality unavailable without DB. Those unrelated features are outside preview acceptance; their live D1 data remains untouched. Verify the ordinary existing app separately for those features. This limitation must be explicit in the test report; do not claim D1 interactions were tested in the preview. Any later request to bind the production D1 database or test its writes needs separate review and authorization.

## 5. Logging, storage and cache protections

| Layer | Required proposed rule / evidence |
| --- | --- |
| Application code | No request/response dumps, environment dumps, raw exception objects or credential logging on auth routes; fixed generic errors |
| Callback request logging | Exclude query strings at edge/access gateway, worker invocation/error systems and tracing; path-only route labels |
| Start request logging | Exclude body and sensitive headers; transient DOB must not reach logs, sampling or request replay |
| Responses | Do not capture callback response bodies; they deliberately contain a short-lived session delivery payload |
| Headers | Never log Authorization, Cookie, Set-Cookie, Sites bypass headers, credential fields or upstream token responses |
| Browser telemetry | Optional RUM/reading/analytics disabled; no session replay, third-party analytics or recording extensions used for the test |
| Caching | Preserve app no-store/private and CDN no-store on auth responses, no-referrer and CSP; no CDN caching of credential-bearing completion or personalized errors |
| Test evidence | Test ID, time, route label, outcome, HTTP status and duration only; protected account-ID mapping separately; no HAR files or full callback/address-bar screenshots |
| Database evidence | Counts/status for approved fixtures only; no token/nonce/verifier/DOB dump; preserve configured record ownership restrictions |

Candidate application handlers already include generic errors, state/nonce/PKCE, no-store headers and a CSP for completion, but these do NOT prove that Sites/Cloudflare dispatch, owner-login redirects, external logging sinks, Google/Supabase or browser tooling omit sensitive values. Native logging controls, inherited sinks and provider retention have not been inspected for a new runtime. Required redaction must occur BEFORE storage/export; deleting logs afterward is insufficient. Do not weaken unrelated production security logging to protect a test callback.

Propose retaining only redacted preview operational logs for up to seven days, with confirmed provider deletion/backup behavior and owner-only access. This is a new review proposal, separate from the already approved-in-principle seven-day CLEANUP JOB history policy. It is not a claim that platform log retention is configurable to seven days. If required exclusions or acceptable retention cannot be established with supported controls and provider documentation, do not run real OAuth/DOB requests on the preview; review another hosting/logging arrangement first. Infrastructure security logs that cannot be excluded need a documented, accepted data inventory/retention decision before testing.

## 6. Required verification before the maintenance window

All remote verification below is FUTURE work requiring its own preparation/deployment/test authorization. No request is sent to a new preview as part of this document.

1. Fresh read-only baseline of current live Site audience/version/environment and Supabase state. Confirm no accidental production secret updates and preserve all existing worker/D1 data. Create/capture exact source and recovery checkpoints under the separately approved workflow.
2. After separately authorized private runtime/domain setup, inspect returned canonical and alias addresses, TLS and owner-only access. Test signed-out, wrong-owner and direct API/asset/alias access without real data. Failure must not expose the app, credentials or mutation endpoints. robots/noindex is supplementary, never access control.
3. Verify custom domain → owner login → return to same host works, plus wrong/expired owner session failure. Inspect actual cookie host/Secure/HttpOnly/SameSite behavior and Sites parameter forwarding. Do not register Google callbacks until this exact origin is confirmed; no fallback hostname substitution without review.
4. Before real secrets or DOB/OAuth use, test logging with harmless unique sentinel values for callback query, start body, auth/cookie headers and an error response in the controlled preview. Use invalid state/input so no real identity exchange/account writes occur. Inspect every relevant permitted sink and sampled error path, not only application console output. Absence from one log view is not proof that all provider logging is safe.
5. Confirm server secrets absent from static assets/source maps and client bundle graphs; preserve configured Supabase host/public-key build guards. Secrets must exist only in the server runtime. Verify no public-origin/alias exposure and no callback cache hit between independent browsers.
6. Then, only inside the separately approved maintenance window, verify legitimate Google completion through both access gates, and denial for G3/unadmitted direct signup. Test new/returning accounts and safe return paths while keeping public audience closed. Preserve the shared-project email-signup impact and planned exit steps.
7. On exit pause admission, disable Google, block preview access and perform only the separately approved initial-test reverse procedure. Restrict saved preview versions too; removing DNS alone does not close a generated alias or revoke Supabase sessions. Retain minimal redacted evidence and independently scoped access-revocation receipts. Existing sessions are not revoked by pausing; scoped handling remains separately reviewed.

## 7. Decisions still needed

- Accept the proposed canonical hostname and exact callback, subject to DNS/private-custom-domain/TLS verification; the address is not reserved or active.
- Authorize a separate owner-private Sites runtime only after exact creation/deployment/access review; do not modify the existing public Site or create a new Supabase/D1 backend.
- Confirm native private domain/alias enforcement and callback behavior; if unsupported, return for a new exact generated-origin proposal.
- Review the privileged production service-key exposure, exact Google client/audience, owner secret-entry path, test-subject enrollment and cookie behavior.
- Approve or revise preview-log retention after provider evidence. Current cleanup-history approval does not cover this new log policy.
- Verify logging exclusions and access controls; unresolved controls are a hard blocker, not permissions to disable safeguards.

The test-only agreement draft/bundle is approved IN PRINCIPLE per the latest user message, not effective or installed. All scheduling, creation, deployment, DNS, credential, provider, SQL and publication execution remains expressly held.

## Evidence and references

### Read-only blocker check — 2026-10-15

Execution remains held. This check used native `get_site`/`list_custom_domains`, published provider documentation, exposed tool contracts and local source inspection. No creation, deployment, DNS lookup/change, credential query, production log retrieval, SQL, provider setting, invitation or real OAuth request was performed. The current Site remains public, the caller is its owner, `current_preview_url` is null and the attached-domain list is empty. These facts concern the existing Site; they do not establish a future preview's configuration.

| Gate | Finding | Remaining evidence |
| --- | --- | --- |
| Custom-domain capability | OpenAI's current help page explicitly includes workspace Sites. The native add-domain contract requires a published Site. General support is documented; creating one as a probe would exceed this task. | Account-specific availability and owner-restricted custom-host behavior remain unverified. No returned preview hostname, CNAME or TLS state exists to inspect. |
| Private audience | The documented narrow audience includes owner **and workspace admins**. Earlier “owner-only” wording in this proposal is a target, not proof that admins are excluded. | Confirm the applicable admin boundary and review who can administer/access the future runtime and its secrets. No guarantee of sole-person access is established. |
| All routes and aliases | No available read-only contract establishes the full custom-host/generated-alias/direct-worker boundary or OAuth return behavior. | Obtain platform confirmation, followed later by authorized signed-out/wrong-user/API/asset/alias tests and owner-login callback/cookie checks. Never exempt the callback. |
| Application logging | Candidate auth handlers contain no console logging, use generic errors and set no-store/no-referrer headers. Callback HTML removes the query in browser history. | These are source findings, not protection against an upstream request log captured before code or browser history executes. |
| Managed logging | The Sites log tool reads recent Worker events; it exposes no retention, redaction, sink inventory or invocation-logging configuration. No such policy-reading tool was found in the available Sites capabilities. | Platform evidence is required for pre-storage exclusions, gateway/auth redirects, error tracing, exports, response capture and privileged log access. Absence of an exposed control does not prove the capability is impossible. |
| Retention | Cloudflare's current Workers Logs documentation specifies request-URL invocation messages and three-day Free/seven-day Paid retention. It also documents disabling invocation logs in directly managed Workers configuration. | This does not identify Sites' effective plan, settings, gateway logs, exports or backup policy, nor prove Sites honors repository Wrangler settings. The proposed seven-day end-to-end ceiling remains unverified and unapproved. |

The official help page changed between the search excerpt and direct retrieval; this assessment uses the directly opened page's current wording, rather than the older excerpt's Enterprise-domain restriction. Sources: [OpenAI Sites help](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites) and [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/). The linked developer guide was also checked; it did not resolve these specific logging/custom-host enforcement questions.

#### Next read-only evidence request — draft, not sent

Ask Sites support/platform owner to confirm the following for the proposed separate restricted runtime, without attaching credentials, real callback URLs with parameters, or user logs:

1. Can an owner-and-admin-restricted Site use `google-test.portalinknetworks.com`, with the same gate on every generated/version/custom alias, asset and API path? Which administrator/service-access exceptions exist, and can any direct Worker endpoint bypass the gate?
2. Does owner reauthentication preserve the same-host `/api/auth/google/callback` query and the app's Secure/HttpOnly/SameSite=Lax cookie without exposing callback values in login redirects or their logs?
3. Which gateway, invocation, exception, tracing and export sinks can receive auth-route URLs, headers, start bodies or callback response bodies? What supported controls exclude sensitive fields **before storage**, and what evidence can the owner inspect?
4. What effective retention, deletion/backup behavior and access roles apply to each sink? Can the proposed seven-day redacted-log ceiling actually be met, including platform copies?

**Disposition:** not ready for real OAuth or DOB traffic. Private custom-domain support is partially documented, but exact access/callback enforcement and end-to-end logging protections remain open. First obtain these platform answers; any later synthetic deployed verification needs separate authorization. Do not relax the gate, use a public callback, change hosting, or provision a preview as a workaround. Other proposal gates (privileged production key, exact Google client, secure test enrollment and shared-Supabase maintenance/recovery) remain pending; this check does not revalidate Supabase settings or approve them.

Local files reviewed: `.openai/hosting.json`, `src/server/googleHandoff.ts`, `src/features/auth/googleCallback.ts`, `src/services/supabase/googleHandoff.ts`, `src/sites-worker.ts` and the activation/test plans. Read-only native Sites metadata confirmed current public audience, owner role, no preview URL and no custom domains; secret values were neither requested nor printed. No source or runtime configuration is changed by this proposal.

Platform contract: installed [Sites skill](C:/Users/avima/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/skills/sites/SKILL.md) and its [identity/secrets reference](C:/Users/avima/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/skills/sites/references/identity-and-secrets.md). Sites preserves its authentication routes and runtime-secret boundary; a private deployment is an externally hosted production URL. Protocol references: [Google OpenID Connect exact redirect/state/nonce rules](https://developers.google.com/identity/openid-connect/openid-connect), [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), and [Google audience rules and basic-identity exception](https://support.google.com/cloud/answer/15549945). These establish protocol requirements, not successful operation of this as-yet-uncreated preview.
