type HealthConfig = { supabaseUrl: string; publishableKey: string };
const PROBE_ITEM = '9ae4b24a-446d-41b8-b3a9-1a035ed14fc7';

/** Public readiness, not liveness: no privileged key, item payload or errors returned. */
export async function handleHealth(request: Request, config: HealthConfig, fetcher: typeof fetch = fetch): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
  let ready = false;
  try {
    if (!config.supabaseUrl || !config.publishableKey) throw new Error('Not configured');
    const upstream = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/resolve_citation_item`, {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { apikey: config.publishableKey, authorization: `Bearer ${config.publishableKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_item_id: PROBE_ITEM, p_require_citable: false }),
    });
    if (upstream.ok) {
      const item: unknown = await upstream.json();
      ready = !!item && typeof item === 'object' && !Array.isArray(item)
        && (item as { id?: unknown }).id === PROBE_ITEM;
    }
  } catch { /* fixed public result; never leak upstream detail */ }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ status: ready ? 'ok' : 'unavailable' }), { status: ready ? 200 : 503, headers });
}
