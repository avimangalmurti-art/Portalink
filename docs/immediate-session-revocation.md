# Immediate device-session revocation — pending activation

Apply only `supabase/pending/immediate_account_session_revocation.sql`, after
explicit approval. The existing session deletion RPC remains unchanged. After
deletion commits, subsequent protected Data API requests must reject the revoked
JWT without waiting for expiry; other same-account devices remain usable.
Requests already authorized before deletion may finish.

The migration creates two narrow functions, installs the session existence,
ownership and `not_after` check as the PostgREST pre-request hook, and adds
restrictive policies to the31 explicitly inventoried existing RLS tables:
29public tables, `storage.objects`, and `realtime.messages`. Existing permissions,
privacy and ownership policies remain in force. Anonymous visitors and server
processing retain existing permissions. No accounts, credentials, data, Auth
configuration, migration ledger or services are replaced. It aborts atomically
on an existing hook, function/policy collision or missing/RLS-disabled relation.

Read-only live preflight found these31 tables, no role-level hook and no
`require_active_account_session()` collision. Recheck database/role settings and
both function/policy names at activation. Do not rerun the previously applied
device-session migration. The Sites worker also checks the session before D1
access, failing closed on rejection or unavailable/missing backend functions.
Activate SQL and verify live HTTP behavior before publishing this worker.

The production fetch observer signs out locally and clears channels on explicit
`PT401` denial. Responses for old tokens cannot sign out a replacement login.
Idle foreground UI checks every15s and on focus/visibility; backend access is
denied immediately. Offline/404/rate-limit/server failures do not sign users out.

Previously downloaded/displayed content cannot be recalled. Existing Storage
signed URLs remain valid until expiry, as the UI states. Postgres Changes checks
current RLS for new records. Supabase caches private Broadcast permissions until
JWT refresh/expiry: an old connection can still receive limited typing/activity
invalidation metadata, which contains no message bodies. Resulting database
requests fail; the normal observer closes channels upon detection. This change
does not claim forced termination of a hostile cached Broadcast connection or
revocation of already issued bearer media links.

Local real-SQL tests cover all31 restrictive policies, ownership, revoked/missing/
malformed/foreign/expired sessions, another device, anonymous access, service-role
processing and atomic existing-hook protection. Hook tests model PostgREST's
entry check; they do not establish live HTTP activation. Worker tests prove no
D1 access after denial/unavailable verification. Observer and client-wiring
tests cover stale responses/local logout/channel cleanup/network failures.
Simulated420x912 and1280x900 browser checks cover revoked request→signed-out UI
and Cancel with no real writes. No physical iPhone or real cross-device test.

After approval, apply only that file, verify catalog/grants/hook, run rollback-only
synthetic session checks with no residual rows, and verify anonymous/public and
authenticated live APIs. Do not revoke real sessions without an explicitly
identified disposable target. Move the byte-identical applied file to migrations
after success. Publish matching reviewed source and check the live worker/UI.

Rollback requires approval: restore previous worker/UI, reset only the new
authenticator pre-request setting, notify PostgREST to reload config, drop only
the31 `account_session_active` policies and these two functions. Preserve all
existing permissive policies and the original session list/revoke functions.
Revoked sessions cannot be restored; those devices sign in again. Rollback
restores the prior access-token-expiry limitation.

References: [API request checks](https://supabase.com/docs/guides/api/securing-your-api),
[sessions](https://supabase.com/docs/guides/auth/sessions), and
[Realtime authorization cache](https://supabase.com/docs/guides/realtime/authorization).

Activation2026-10-12: the approved single file was applied once to the existing production project after preflight. It is now inventoried byte-identically as supabase/migrations/202610120002_immediate_account_session_revocation.sql. Live rollback verification passed; publication receipt follows. Historical pending instructions above describe pre-activation scope.
