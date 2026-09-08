// Candidate request handler. The deployed index.ts remains a hard-disabled 503.
export function createDeletionHandler(admin, { enabled = false } = {}) {
  return async request => {
    const response = (status, body) => Response.json({ isDeleted: false, ...body }, { status });
    if (request.method !== 'POST') return response(405, { message: 'Method not allowed.' });
    let body;
    try { body = await request.json(); } catch { return response(400, { message: 'Invalid request.' }); }
    if (!body || !['request', 'cancel', 'status'].includes(body.action)) return response(400, { message: 'Invalid action.' });
    if (body.action === 'request' && !enabled) return response(503, { message: 'Account deletion is disabled.' });
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response(401, { message: 'Sign in to continue.' });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return response(401, { message: 'Sign in to continue.' });
    if (body.action === 'request' && (!data.user.email || typeof body.confirmation !== 'string'
      || body.confirmation.trim().toLowerCase() !== data.user.email.toLowerCase())) return response(400, { message: 'Confirm your email address.' });
    const name = { request: 'request_account_deletion', cancel: 'cancel_account_deletion', status: 'account_deletion_status' }[body.action];
    // Never trust a submitted accountId. Recovery actions remain callable when
    // new requests are disabled, so an emergency stop cannot prevent cancel.
    const result = await admin.rpc(name, { p_account_id: data.user.id });
    if (result.error) return response(409, { message: body.action === 'cancel' ? 'Cancellation is unavailable because permanent deletion has started.' : 'The request could not be completed. No new deletion was started.' });
    return response(200, { ...result.data, message: body.action === 'request' ? 'Deletion is scheduled in 48 hours. You can cancel before permanent deletion starts.' : body.action === 'cancel' ? 'Deletion cancelled. Your account and content are restored.' : '' });
  };
}
