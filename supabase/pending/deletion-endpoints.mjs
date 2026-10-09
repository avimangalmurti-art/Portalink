import { createDeletionHandler } from './deletion-request.mjs';
import { runDeletionTick } from './deletion-worker.mjs';

/** Deployment adapter candidate; no startup, scheduler or environment reads.
 * Both runtime gates are off by default; database gates independently enforce.
 * Keep the currently deployed hard-disabled wrapper until provider review. */
export function createDeletionEndpoints(createAdmin, { requestsEnabled = false, workerEnabled = false, workerToken = '' } = {}) {
  const disabled = () => Response.json({ isDeleted: false, message: 'Account deletion is disabled.' }, { status: 503 });
  return async request => {
    const action = new URL(request.url).pathname.split('/').at(-1);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (action === 'tick') {
      if (!workerEnabled) return disabled();
      // An internal bearer credential, not the anon/project publishable key.
      if (!workerToken || request.headers.get('authorization') !== `Bearer ${workerToken}`) return new Response(null, { status: 401 });
      return Response.json(await runDeletionTick(createAdmin(), { enabled: true }));
    }
    if (!['request','status','cancel'].includes(action)) return new Response(null, { status: 404 });
    if (!requestsEnabled && action === 'request') return disabled();
    const original = await request.json().catch(() => null);
    if (!original || typeof original !== 'object') return new Response(null, { status: 400 });
    const forwarded = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ ...original, action }) });
    return createDeletionHandler(createAdmin(), { enabled: requestsEnabled, processImmediately: workerEnabled })(forwarded);
  };
}
