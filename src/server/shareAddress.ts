import { handleFromPath, parseResolution, portfolioPath, validHandle, type HandleResolution } from '../features/sharing/shareModel';
export type ShareConfiguration = { supabaseUrl: string; publishableKey: string };
export async function publicShareRpc(config: ShareConfiguration, name: string, args: Record<string, string>) {
  // workerd supports manual/follow only. Reject 3xx below without following
  // them or forwarding the public key to a different destination.
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: config.publishableKey, 'content-type': 'application/json' }, body: JSON.stringify(args), credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(2500) });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string } | null;
    if (error?.code === 'PGRST202' || error?.code === '42883') return null;
    throw new Error('Public address lookup is unavailable.');
  }
  return response.json();
}
export async function resolveShareRequest(request: Request, config: ShareConfiguration): Promise<{ redirect?: Response; resolution?: HandleResolution; missing?: boolean; unavailable?: boolean }> {
  const url = new URL(request.url), handle = handleFromPath(url.pathname);
  try {
    if (handle) {
      const resolution = parseResolution(await publicShareRpc(config, 'resolve_profile_handle', { p_handle: handle }));
      if (!resolution) return { missing: true };
      if (resolution.alias || url.pathname !== `/${resolution.handle}`) return { redirect: permanent(portfolioPath(resolution.profileId, resolution.handle) + url.search, url), resolution };
      return { resolution };
    }
    const uuid = /^\/share\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i.exec(url.pathname);
    if (uuid) {
      const data = await publicShareRpc(config, 'profile_share_address', { p_profile_id: uuid[1] });
      if (typeof data?.handle === 'string' && validHandle(data.handle)) return { redirect: permanent(portfolioPath(uuid[1], data.handle) + url.search, url) };
    }
  } catch { return handle ? { unavailable: true } : {}; }
  return {};
}
function permanent(path: string, url: URL): Response { return new Response(null, { status: 301, headers: { location: new URL(path, url.origin).href, 'cache-control': 'private, no-store' } }); }
export function injectShareResolution(html: string, resolution?: HandleResolution): string {
  if (!resolution) return html;
  return html.replace('<head>', `<head><script>window.__PORTALINK_HANDLE__=${JSON.stringify(resolution).replace(/</g, '\\u003c')};</script>`);
}
