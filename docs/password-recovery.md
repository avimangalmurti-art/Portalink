# Password recovery

Recovery stays with Supabase Auth. Portalink does not create reset tokens, send
mail itself, or authorize password updates from URL parameters.

1. Forgot password calls `resetPasswordForEmail` with the current origin and
   `/?auth=reset-password`. The email-request success screen directs the user
   to their inbox; it does not open an unverified password form.
2. The Supabase SDK consumes the emailed link. Its recovery listener is registered
   during client creation, before React mounts. The callback query selects the
   reset form even when the link is expired; it does not grant recovery access.
3. A verified recovery event creates a tab-local, one-hour checkpoint bound to
   the account ID and auth session ID. No access token or password is copied into
   this checkpoint. It survives a refresh and is cleared on logout, session/account
   changes, expiry, or a successful password update.
4. The form's recovery lookup has a stable callback. It runs again when the
   authenticated account or recovery state changes, including a late SDK event.
   Temporary verification errors can be retried; expired links require a new link.
5. Before saving, Supabase verifies the recovered session's user. An isolated,
   non-persisting SDK client performs the update with that session. A concurrent
   sign-in cannot redirect the write into another account or overwrite its
   global browser session. The UI confirms success only after the update succeeds.

## Return URLs

`supabase/config.toml` declares the canonical Portalink site URL and exact
production/local recovery return URLs. The existing Vercel allowlist entry is
retained for older links. Only these two Auth configuration properties are changed;
email confirmation, MFA, email transport, and all other hosted settings are preserved.
Preview changes with `supabase config diff` before applying them.

## Validation

`tests/password-recovery.test.mjs` covers provider-only recovery, URL handling,
refresh and token refresh, expiry/logout/account changes, blocked storage,
request versus authorization, save completion, rejected-password retry,
concurrent account switching, stable loading, and startup ordering. These tests
use synthetic sessions and provider responses; they do not send emails or change
real account passwords. Real inbox delivery and user password entry remain a
manual end-to-end check using a newly requested link after deployment.
