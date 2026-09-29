type PreviewConfiguration = { supabaseUrl: string; publishableKey: string };
type SharedTarget = { profileId: string; categoryId?: string; projectId?: string };
type Preview = { title: string; description: string };
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const sharedRoute = new RegExp(`^/share/(${UUID})(?:/c/(${UUID})(?:/(${UUID}))?)?/?$`, 'i');

export function isSharedPreviewPath(path: string): boolean {
  return sharedRoute.test(path);
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

async function readPublicPreview(target: SharedTarget, config: PreviewConfiguration): Promise<Preview | null> {
  if (!config.supabaseUrl || !config.publishableKey) return null;
  let table: string;
  const query = new URLSearchParams({ limit: '1' });
  if (target.projectId) {
    table = 'projects';
    query.set('select', 'id,title,summary,profile:profiles!inner(name,is_private),category:portfolio_categories!inner(id,is_hidden)');
    query.set('id', `eq.${target.projectId}`);
    query.set('profile_id', `eq.${target.profileId}`);
    query.set('category_id', `eq.${target.categoryId}`);
    query.set('is_hidden', 'eq.false');
    query.set('category.is_hidden', 'eq.false');
    query.set('profile.is_private', 'eq.false');
  } else if (target.categoryId) {
    table = 'portfolio_categories';
    query.set('select', 'id,label,blurb,profile:profiles!inner(name,is_private)');
    query.set('id', `eq.${target.categoryId}`);
    query.set('profile_id', `eq.${target.profileId}`);
    query.set('is_hidden', 'eq.false');
    query.set('profile.is_private', 'eq.false');
  } else {
    table = 'profiles';
    query.set('select', 'id,name,headline,is_private');
    query.set('id', `eq.${target.profileId}`);
    query.set('is_private', 'eq.false');
  }
  // Always anonymous, even when the HTML request belongs to an owner/follower.
  // Public previews must never inherit authorization or cookies from a viewer.
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.publishableKey, accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) return null;
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  if (!row || row.id !== (target.projectId ?? target.categoryId ?? target.profileId)) return null;
  const profile = target.categoryId ? row.profile : row;
  if (!profile || profile.is_private !== false) return null;
  if (target.projectId && (!row.category || row.category.id !== target.categoryId || row.category.is_hidden !== false)) return null;
  const creator = text(profile.name, 80);
  if (!creator) return null;
  const title = target.projectId ? text(row.title, 120) : target.categoryId ? text(row.label, 80) : '';
  if (target.categoryId && !title) return null;
  return {
    title: title ? `${title} — ${creator} | Portalink` : `${creator} | Portalink`,
    description: text(target.projectId ? row.summary : target.categoryId ? row.blurb : row.headline, 220)
      || `Explore ${creator}'s creative work on Portalink.`,
  };
}

/** Personalize public share HTML; private/missing/offline targets stay generic. */
export async function withSharedPreview(response: Response, request: Request, config: PreviewConfiguration): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(sharedRoute);
  if (!match || (request.method !== 'GET' && request.method !== 'HEAD') || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  // Re-evaluate privacy on every navigation. Never reuse a shared HTML ETag or
  // retain owner/project text in an edge/browser cache after privacy changes.
  headers.set('cache-control', 'private, no-store');
  for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) headers.delete(name);
  // HEAD describes the uncached share response without fetching optional text.
  if (request.method === 'HEAD') return new Response(null, { status: response.status, headers });
  let preview: Preview | null = null;
  try {
    preview = await readPublicPreview({ profileId: match[1], categoryId: match[2], projectId: match[3] }, config);
  } catch {
    // Social previews are optional. An upstream failure must not block the app.
  }
  if (!preview) return new Response(response.body, { status: response.status, headers });
  let html = await response.text();
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  html = html.replace(/<title>[^<]*<\/title>/i, () => `<title>${title}</title>`);
  for (const [name, content] of [['description', description], ['og:title', title], ['og:description', description], ['twitter:title', title], ['twitter:description', description]]) {
    const tag = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["'][^"']*["']\\s*\\/?>(?:\\r?\\n)?`, 'i');
    html = html.replace(tag, () => `<meta ${name.startsWith('og:') ? 'property' : 'name'}="${name}" content="${content}" />\n`);
  }
  // Keep the existing brand image; never manufacture public URLs for private
  // media. Query strings, including any auth callback parameters, are omitted.
  const canonical = escapeHtml(`${url.origin}${url.pathname.replace(/\/$/, '')}`);
  html = html.replace('</head>', () => `<meta property="og:url" content="${canonical}" /><link rel="canonical" href="${canonical}" />\n</head>`);
  return new Response(html, { status: response.status, headers });
}
