import { runDeletionTick } from './deletion-worker.mjs';
// Candidate only. The deployed endpoint and both release gates remain disabled.
const SIGN_IN_METHODS = new Set(['password', 'oauth', 'otp', 'magiclink', 'sso/saml']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECEIPT = /^[0-9a-f]{64}$/;
const hashReceipt = async token => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(token.match(/../g), value => parseInt(value, 16)))), value => value.toString(16).padStart(2, '0')).join('');

// Only the provider-verified claims of THIS token prove a sign-in. JWT iat,
// refresh events, editable metadata and account-wide last_sign_in_at do not.
function recentSignIn(claims, user, issuer, nowSeconds) {
  if (!claims || !issuer || claims.iss !== issuer || claims.sub !== user.id
    || claims.role !== 'authenticated' || claims.is_anonymous !== false
    || !(claims.aud === 'authenticated' || Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
    || !UUID.test(claims.session_id ?? '') || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds
    || !Array.isArray(claims.amr) || !Number.isFinite(nowSeconds)) return null;
  const methods = claims.amr.filter(entry => entry && SIGN_IN_METHODS.has(entry.method));
  if (!methods.length || methods.some(entry => !Number.isInteger(entry.timestamp) || entry.timestamp > nowSeconds)) return null;
  const authenticatedAt = Math.max(...methods.map(entry => entry.timestamp));
  if (nowSeconds - authenticatedAt > 300) return null;
  return { p_session_id: claims.session_id, p_authenticated_at: new Date(authenticatedAt * 1000).toISOString() };
}

export function createDeletionHandler(admin, { enabled = false, processImmediately = false, now = () => Date.now(), authIssuer,
  receiptLifetimeSeconds, receiptRetentionSeconds, d1 = null } = {}) {
  return async request => {
    const response = (status, body) => Response.json({ isDeleted: false, ...body }, { status,
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    const processing = () => response(202, { status: 'processing', message: 'Deletion in progress. Your email remains reserved until deletion is confirmed.' });
    const completed = () => response(200, { isDeleted: true, status: 'completed', message: 'Your account has been deleted. You can register again with the same email address.' });
    const uncertain = () => response(503, { message: 'Deletion could not be confirmed. Check your deletion status before trying again.' });
    const invalidReceipt = () => response(403, { message: 'Deletion status is unavailable with this receipt.' });
    if (request.method !== 'POST') return response(405, { message: 'Method not allowed.' });
    let body;
    try { body = await request.json(); } catch { return response(400, { message: 'Invalid request.' }); }
    if (!body || !['prepare', 'request', 'status'].includes(body.action)) return response(400, { message: 'Invalid action.' });
    if (body.action !== 'status' && !enabled) return response(503, { message: 'Account deletion is disabled.' });
    if (body.action !== 'status' && (typeof d1 !== 'function' || d1.isConfigured === false || !Number.isSafeInteger(receiptLifetimeSeconds) || receiptLifetimeSeconds<1
      || !Number.isSafeInteger(receiptRetentionSeconds) || receiptRetentionSeconds<0
      || !Number.isFinite(new Date(now()+(receiptLifetimeSeconds+receiptRetentionSeconds)*1000).getTime()))) {
      return response(503, { message: 'Account deletion is not configured.' });
    }
    // Receipt status is independent of the deleted Auth identity. The raw
    // capability is accepted only in this POST body; SQL receives only a hash.
    if (body.action === 'status' && Object.hasOwn(body, 'receipt')) {
      if (typeof body.receipt !== 'string' || !RECEIPT.test(body.receipt)) return invalidReceipt();
      let result;
      try { result = await admin.rpc('account_deletion_receipt_status', { p_token_hash: await hashReceipt(body.receipt) }); } catch { return uncertain(); }
      if (!result || result.error || !result.data || typeof result.data !== 'object') return uncertain();
      if (result.data.status === 'completed' && result.data.isDeleted === true) return completed();
      if (result.data.status === 'processing' && result.data.isDeleted === false) return processing();
      if (result.data.status === 'none' && result.data.isDeleted === false) return response(200, { status: 'none', message: 'No deletion in progress.' });
      return invalidReceipt();
    }
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(401, { message: 'Sign in to continue.' });
    let verified;
    try { verified = await admin.auth.getUser(token); } catch { return uncertain(); }
    const user = verified?.data?.user;
    if (verified?.error || !user || typeof user.id !== 'string' || !user.id) return response(401, { message: 'Sign in to continue.' });
    // The expected identity is an extra equality check, never an authority.
    // A shared client switching accounts cannot mint B's receipt for A's flow.
    if (body.action === 'prepare' && body.expectedAccountId !== user.id) return response(401, { message: 'Your account changed. Reopen deletion for the intended account.' });
    if (body.action === 'request' && (typeof user.email !== 'string' || !user.email || typeof body.confirmation !== 'string'
      || body.confirmation.trim().toLowerCase() !== user.email.toLowerCase())) return response(400, { message: 'Confirm your email address.' });
    let signIn = null;
    if (body.action !== 'status') {
      let verifiedClaims;
      try { verifiedClaims = await admin.auth.getClaims(token); } catch { return uncertain(); }
      const issuer = authIssuer ?? (typeof admin.supabaseUrl === 'string' ? `${admin.supabaseUrl.replace(/\/$/, '')}/auth/v1` : null);
      signIn = !verifiedClaims?.error && recentSignIn(verifiedClaims?.data?.claims, user, issuer, Math.floor(now() / 1000));
      if (!signIn) return response(401, { message: 'Sign in again, then confirm deletion within five minutes.' });
    }
    if (body.action === 'prepare') {
      const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
      const expires = now()+receiptLifetimeSeconds*1000;
      let result;
      try {
        result = await admin.rpc('prepare_account_deletion_receipt', { p_account_id: user.id, ...signIn, p_token_hash: await hashReceipt(receipt),
          p_expires_at: new Date(expires).toISOString(), p_purge_after: new Date(expires+receiptRetentionSeconds*1000).toISOString() });
      } catch { return uncertain(); }
      if (!result || result.error || !Object.hasOwn(result, 'data')) return uncertain();
      return response(200, { status: 'prepared', receipt });
    }
    // Identity comes exclusively from the verified token, never request JSON.
    // Existing job status remains readable when new requests are disabled.
    const name = body.action === 'request' ? 'request_account_deletion' : 'account_deletion_status';
    if (body.action === 'request' && (typeof body.receipt !== 'string' || !RECEIPT.test(body.receipt))) return invalidReceipt();
    let result;
    try { result = await admin.rpc(name, { p_account_id: user.id, ...(signIn || {}),
      ...(body.action === 'request' ? { p_receipt_hash: await hashReceipt(body.receipt) } : {}) }); } catch { return uncertain(); }
    if (body.action === 'request' && result?.error && ['recent sign-in required', 'active account session required'].includes(result.error.message)) {
      return response(401, { message: 'Sign in again, then confirm deletion within five minutes.' });
    }
    if (result?.error?.message === 'valid deletion receipt required') return invalidReceipt();
    if (!result || result.error || !result.data || typeof result.data !== 'object') return uncertain();
    if (result.data.status === 'completed' && result.data.isDeleted === true) return completed();
    if (result.data.status !== 'processing') {
      if (body.action === 'status' && Object.keys(result.data).length === 0) return response(200, { status: 'none', message: 'No deletion in progress.' });
      return uncertain();
    }
    if (body.action === 'request' && processImmediately) {
      const outcome = await runDeletionTick(admin, { enabled: true, accountId: user.id, d1 });
      if (outcome.status === 'completed') return completed();
    }
    return processing();
  };
}
