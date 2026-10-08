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
      const suffix = url.pathname.slice(handle.length + 1).replace(/\/$/, '');
      const canonical = portfolioPath(resolution.profileId, resolution.handle) + suffix;
      if (url.pathname !== canonical) return { redirect: permanent(canonical + url.search, url), resolution };
      return { resolution };
    }
    const uuid = /^\/share\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})(\/c\/[a-z0-9_-]{1,128}(?:\/[a-z0-9_-]{1,128})?|\/collaboration)?\/?$/i.exec(url.pathname);
    if (uuid) {
      const data = await publicShareRpc(config, 'profile_share_address', { p_profile_id: uuid[1] });
      if (typeof data?.handle === 'string' && validHandle(data.handle)) return { redirect: permanent(portfolioPath(uuid[1], data.handle) + (uuid[2] ?? '') + url.search, url) };
    }
  } catch { return handle ? { unavailable: true } : {}; }
  return {};
}
function permanent(path: string, url: URL): Response { return new Response(null, { status: 301, headers: { location: new URL(path, url.origin).href, 'cache-control': 'private, no-store' } }); }
export function injectShareResolution(html: string, resolution?: HandleResolution, canonicalUrl?: string): string {
  if (!resolution) return html;
  if (canonicalUrl) {
    const escaped = canonicalUrl.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
    html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '').replace(/<meta\b[^>]*property=["']og:url["'][^>]*>/gi, '');
    html = html.replace('<head>', `<head><link rel="canonical" href="${escaped}"><meta property="og:url" content="${escaped}">`);
  }
  return html.replace('<head>', `<head><script>window.__PORTALINK_HANDLE__=${JSON.stringify(resolution).replace(/</g, '\\u003c')};</script>`);
}

/** Sitemap contains anonymous public creator addresses, never account/private data. */
export async function publicSitemap(request: Request, config: ShareConfiguration): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  try {
    const urls = new Set<string>();
    for (let offset = 0; offset < 50000; offset += 1000) {
      const query = new URLSearchParams({select:'id,handle',is_private:'eq.false',order:'id.asc',limit:'1000',offset:String(offset)});
      const response = await fetch(`${config.supabaseUrl}/rest/v1/profiles?${query}`, {headers:{apikey:config.publishableKey},credentials:'omit',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(2500)});
      if (!response.ok) throw new Error('Unavailable');
      const rows = await response.json() as Array<{id:string;handle:string}>;
      for (const row of rows) if (/^[a-f0-9-]{36}$/i.test(row.id) && validHandle(row.handle)) urls.add(new URL(portfolioPath(row.id,row.handle),request.url).href);
      if (rows.length < 1000) break;
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map(url=>`<url><loc>${url.replace(/&/g,'&amp;')}</loc></url>`).join('')}</urlset>`;
    return new Response(request.method === 'HEAD' ? null : xml,{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'private, no-store'}});
  } catch { return new Response('Sitemap unavailable',{status:503,headers:{'cache-control':'no-store'}}); }
}
