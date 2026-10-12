# Account session devices — release preparation

The screen uses the existing Supabase account/session records. Browser and OS
names are user-agent estimates, not hardware identity. A session row can remain
until Auth cleans it up; sign-in and last-refresh times do not establish recent
human activity. No IP, location, credentials, refresh/access tokens, MFA secrets,
or user IDs are returned. Lists page through 50 rows using creation time and ID.

## Pending activation

`supabase/pending/account_session_devices.sql` is **unapplied**. It creates only
`public.list_my_account_sessions(timestamptz, uuid)` and
`public.revoke_my_account_session(uuid)` with empty search paths. Anonymous/PUBLIC
execute permissions are revoked; authenticated callers can only operate on their
own existing sessions. Both calls require the JWT session ID to belong to the
caller and to still exist without an expired `not_after`. Revocation locks the
caller row while checking and deleting the target. Current-session sign-out uses
the existing local SDK flow; the SQL function rejects the current session.

Deletion follows Auth's own `LogoutSession` implementation: delete one owned row
from `auth.sessions`, allowing its existing foreign-key cascades to remove its
refresh-token chain. Existing access tokens can remain usable until expiry;
the screen states that limitation. The migration itself does not sign anyone out.

Before applying: obtain explicit approval for this one SQL file, inspect the live
`auth.sessions` columns/ownership and refresh-token FK cascade, confirm no function
name collision, and retain the current backup. Do not apply any unrelated pending
or historical migrations or repair the CLI ledger. Apply once through the existing
production SQL workflow. Record the receipt and move the unchanged file into the
migration inventory only after success. Check anonymous denial and authenticated
listing; do not revoke a real user's sessions during verification without a
specific disposable target. Publish the matching reviewed source after activation.

Rollback disables these endpoints by revoking their authenticated execute grants
or dropping only these two functions, then restoring the previous published UI.
Previously signed-out sessions cannot be restored; those users sign in again.

## Verification and limits

Local PostgreSQL-compatible database tests exercise real SQL functions, role
permissions, account isolation, revoked/expired caller denial, current-session
protection, target-only deletion and refresh-token cascade, pagination/tied times,
and restricted output. Service/component tests exercise cursor mapping, missing
migration errors, account changes, confirmation/cancel, duplicate submission,
failure recovery, and local sign-out. Simulated browser checks cover mobile420x912
and desktop1280x900 with no real network writes. These do not prove production
schema compatibility, cross-device revocation, or physical-phone behavior.

References: [Supabase session documentation](https://supabase.com/docs/guides/auth/sessions)
and [Auth session implementation](https://github.com/supabase/auth/blob/master/internal/models/sessions.go).
