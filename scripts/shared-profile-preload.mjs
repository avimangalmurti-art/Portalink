/** A classic head script starts this read before the visitor module graph loads.
 * Keep this function self-contained: its source is embedded by the Vite plugin. */
function startSharedProfilePreload(configuration) {
  const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
  const route = new RegExp('^/share/(' + uuid + ')(?:/collaboration|/c/' + uuid + '(?:/' + uuid + ')?)?/?$', 'i');
  const match = window.location.pathname.match(route);
  if (!match || window.__PORTALINK_SHARED_BUNDLE_PRELOAD__) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const promise = Promise.resolve().then(() => fetch(configuration.supabaseUrl + '/rest/v1/rpc/shared_profile_bundle', {
    method: 'POST',
    headers: { apikey: configuration.publishableKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ profile_id: match[1].toLowerCase() }),
    credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
  })).then(async response => {
    const body = await response.json();
    if (response.ok) return { data: body, error: null };
    return { data: null, error: {
      code: typeof body?.code === 'string' ? body.code : undefined,
      message: typeof body?.message === 'string' ? body.message : 'The shared profile could not be loaded.',
    } };
  }).catch(() => ({ data: null, error: { message: 'The shared profile could not be loaded. Please try again.' } }))
    .finally(() => clearTimeout(timer));
  window.__PORTALINK_SHARED_BUNDLE_PRELOAD__ = { version: 1, profileId: match[1].toLowerCase(), startedAt: Date.now(), promise };
}

function publicConfiguration(configuration) {
  const supabaseUrl = configuration.supabaseUrl?.trim() ?? '';
  const publishableKey = configuration.publishableKey?.trim() ?? '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || supabaseUrl.includes('YOUR_')
    || publishableKey.length <= 20 || publishableKey.length > 4096 || publishableKey.includes('YOUR_')) return null;
  if (publishableKey.startsWith('sb_publishable_')) return { supabaseUrl, publishableKey };
  // Legacy anonymous JWT keys remain supported. Never serialize service-role
  // JWTs or sb_secret_* values into generated HTML, even if misconfigured.
  try {
    const parts = publishableKey.split('.');
    if (parts.length === 3 && JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon') return { supabaseUrl, publishableKey };
  } catch { /* Invalid/placeholder configuration emits no network script. */ }
  return null;
}

export function sharedProfilePreloadScript(configuration) {
  const value = publicConfiguration(configuration);
  if (!value) return null;
  const serialized = JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(${startSharedProfilePreload.toString()})(${serialized});`;
}

function hasLink(html, rel, href) {
  return (html.match(/<link\b[^>]*>/gi) ?? []).some(tag => {
    const attribute = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
    return attribute('rel')?.toLowerCase() === rel && attribute('href') === href;
  });
}

export function sharedProfilePreloadPlugin(configuration) {
  const value = publicConfiguration(configuration);
  return {
    name: 'portalink-shared-profile-preload',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const tags = [];
        const origins = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', ...(value ? [value.supabaseUrl] : [])];
        for (const origin of origins) {
          const dns = origin.replace('https:', '');
          if (!hasLink(html, 'dns-prefetch', dns)) tags.push({ tag: 'link', attrs: { rel: 'dns-prefetch', href: dns }, injectTo: 'head-prepend' });
          if (!hasLink(html, 'preconnect', origin)) tags.push({ tag: 'link', attrs: {
            rel: 'preconnect', href: origin, ...(origin !== 'https://fonts.googleapis.com' ? { crossorigin: 'anonymous' } : {}),
          }, injectTo: 'head-prepend' });
        }
        if (/(?:^|[/\\])share\.html$/.test(context.filename ?? context.path ?? '')) {
          const script = sharedProfilePreloadScript(configuration);
          if (script) tags.push({ tag: 'script', attrs: { 'data-shared-bundle-preload': '' }, children: script, injectTo: 'head-prepend' });
        }
        return tags;
      },
    },
  };
}
