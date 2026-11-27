import { runDeletionTick } from './deletion-worker.mjs';
// Candidate request handler. The deployed index.ts remains a hard-disabled 503.
export function createDeletionHandler(admin, { enabled = false, processImmediately = false } = {}) {
  return async request => {
    const response = (status, body) => Response.json({ isDeleted: false, ...body }, { status });
    if (request.method !== 'POST') return response(405, { message: 'Method not allowed.' });
    let body;
    try { body = await request.json(); } catch { return response(400, { message: 'Invalid request.' }); }
    if (!body || !['preflight', 'request', 'cancel', 'status'].includes(body.action)) return response(400, { message: 'Invalid action.' });
    if ((body.action === 'request' || body.action === 'preflight') && !enabled) return response(503, { message: 'Account deletion is disabled.' });
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(401, { message: 'Sign in to continue.' });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return response(401, { message: 'Sign in to continue.' });
    if (body.action === 'request' && (!data.user.email || typeof body.confirmation !== 'string'
      || body.confirmation.trim().toLowerCase() !== data.user.email.toLowerCase())) return response(400, { message: 'Confirm your email address.' });
    if (body.action === 'preflight') {
      // Lets the client clear other stores only when a request will be accepted.
      const gate = await admin.rpc('account_deletion_requests_open');
      return gate.error || gate.data !== true ? response(503, { message: 'Account deletion is disabled.' }) : response(200, { ready: true });
    }
    const name = { request: 'request_account_deletion', cancel: 'cancel_account_deletion', status: 'account_deletion_status' }[body.action];
    // Never trust a submitted accountId. Recovery actions remain callable when
    // new requests are disabled, so an emergency stop cannot prevent cancel.
    const result = await admin.rpc(name, { p_account_id: data.user.id });
    if (result.error) {
      const started = body.action === 'cancel' && result.error.message?.includes('permanent deletion has started');
      return response(started ? 409 : 503, { message: started
        ? 'Cancellation is unavailable because permanent deletion has started.'
        : 'The request could not be confirmed. Check your deletion status before trying again.' });
    }
    if (body.action === 'status' && processImmediately && result.data?.status === 'processing') {
      // A request that stopped at a checkpoint resumes when its owner checks on it.
      const outcome = await runDeletionTick(admin, { enabled: true, accountId: data.user.id });
      if (outcome.status === 'completed') return response(200, { isDeleted: true, status: 'completed', message: 'Your account has been deleted.' });
    }
    if (body.action === 'request' && processImmediately) {
      let outcome = await runDeletionTick(admin, { enabled: true, accountId: data.user.id });
      // Large accounts continue in the same call; each tick ends on a durable checkpoint.
      for (let i = 0; i < 20 && outcome.status === 'checkpointed'; i++) outcome = await runDeletionTick(admin, { enabled: true, accountId: data.user.id });
      if (outcome.status === 'completed') return response(200, { isDeleted: true, status: 'completed', message: 'Your account has been deleted. You can register again with the same email address.' });
      return response(202, { status: 'processing', message: 'Deletion is processing. Your email becomes available when account deletion is confirmed.' });
    }
    return response(200, { ...result.data, message: body.action === 'request' ? 'Deletion has been requested and can start immediately.' : body.action === 'cancel' ? 'Deletion cancelled. Your account and content are restored.' : '' });
  };
}
