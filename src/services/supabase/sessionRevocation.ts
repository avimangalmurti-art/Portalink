/** Backend enforcement owns access; this observer clears the browser's stale UI. */
export function createSessionRevocationObserver(options: {
  fetch: typeof fetch;
  endpoint: string;
  publishableKey: string;
  currentToken: () => string | null;
  onRevoked: (token: string) => void;
}) {
  let checking = false;
  const inspect = async (response: Response, token: string | null) => {
    if (!token || response.status !== 401) return;
    const body = await response.clone().json().catch(() => null) as { code?: string } | null;
    if (body?.code === 'PT401' && options.currentToken() === token) options.onRevoked(token);
  };
  const guardedFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const response = await options.fetch(input, init);
    await inspect(response, token);
    return response;
  };
  const check = async () => {
    const token = options.currentToken();
    if (!token || checking) return;
    checking = true;
    try {
      const response = await options.fetch(options.endpoint, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, apikey: options.publishableKey, 'content-type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(8_000),
      });
      await inspect(response, token);
    } catch { /* Offline/rate-limit/server failures must never revoke identity. */ }
    finally { checking = false; }
  };
  return { fetch: guardedFetch, check };
}
