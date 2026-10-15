import { plainFormattedText } from '../components/text/textFormatting';
import { portfolioPath, shareCardText, type PortfolioCard } from '../features/sharing/shareModel';
import { readCoverThumbnail } from '../services/supabase/coverThumbnailReads';
type PreviewConfiguration = { supabaseUrl: string; publishableKey: string };
type SharedTarget = { profileId: string; categoryId?: string; projectId?: string };
type Row = Record<string, unknown>;
type Preview = {
  title: string;
  handle?: string;
  description: string;
  type: 'profile' | 'article';
  image: { path: string; public?: boolean; avatar?: boolean; width: number; height: number; alt: string };
};
type CachedPreview = { configuration: string; fingerprint: string; shell: string; html: string; expiresAt: number };
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const uuid = new RegExp(`^${UUID}$`, 'i');
const sharedRoute = new RegExp(`^/share/(${UUID})(?:/c/(${UUID})(?:/(${UUID}))?)?/?$`, 'i');
const previewCache = new Map<string, CachedPreview>();
const CACHE_MILLISECONDS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 128;
const MAX_PROJECT_ATTACHMENTS = 105;
const projectSelect = '*,id,profile_id,category_id,title,summary,is_hidden,position,published_at,profile:profiles!projects_profile_id_fkey!inner(id,name,handle,headline,portfolio_headline,school,avatar_url,is_private),category:portfolio_categories!inner(id,profile_id,is_hidden),attachments:project_attachments(id,project_id,kind,mime_type,storage_path,is_cover,position,metadata)';

export function isSharedPreviewPath(path: string): boolean {
  return sharedRoute.test(path);
}

/** Preserve ordinary navigation/crawler wildcards, but honor an explicit HTML
 * exclusion or a higher preference for another response representation. */
export function prefersHtml(accept: string | null): boolean {
  if (!accept?.trim()) return true;
  const ranges = accept.split(',').map(value => {
    const [type, ...parameters] = value.trim().toLowerCase().split(';');
    const parameter = parameters.find(item => item.trim().startsWith('q='));
    const quality = parameter === undefined ? 1 : Number(parameter.trim().slice(2));
    return { type: type.trim(), quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0 };
  });
  const html = ranges.find(range => range.type === 'text/html')
    ?? ranges.find(range => range.type === 'text/*')
    ?? ranges.find(range => range.type === '*/*');
  return Boolean(html && html.quality > 0 && ranges.every(range => range.quality <= html.quality));
}

function record(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function sameId(value: unknown, expected: string): boolean {
  return typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
}

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, limit).join('') : '';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function dimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 100_000;
}

function serviceOrigin(config: PreviewConfiguration): string | null {
  try {
    const url = new URL(config.supabaseUrl);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)) return null;
    return url.origin;
  } catch { return null; }
}

async function readRows(table: string, query: URLSearchParams, origin: string, config: PreviewConfiguration, signal: AbortSignal): Promise<Row[] | null> {
  // Deliberately never forward request cookies, Authorization, or an owner key.
  let response = await fetch(`${origin}/rest/v1/${table}?${query}`, {
    headers: { apikey: config.publishableKey, accept: 'application/json' },
    cache: 'no-store', redirect: 'manual', signal,
  });
  if (!response.ok && query.get('select')?.includes('portfolio_headline')) {
    const error = await response.clone().json().catch(() => null);
    if ((error?.code === '42703' || error?.code === 'PGRST204') && /portfolio_headline|school/.test(String(error?.message ?? ''))) {
      const legacy = new URLSearchParams(query);
      legacy.set('select', (legacy.get('select') ?? '').replace(/,portfolio_headline,school/g, ''));
      response = await fetch(`${origin}/rest/v1/${table}?${legacy}`, {
        headers: { apikey: config.publishableKey, accept: 'application/json' }, cache: 'no-store', redirect: 'manual', signal,
      });
    }
  }
  if (!response.ok) return null;
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.some(row => !record(row))) return null;
  return rows as Row[];
}

function visibleProfile(value: unknown, profileId: string): Row | null {
  const profile = record(value);
  return profile && sameId(profile.id, profileId) && profile.is_private === false ? profile : null;
}

function visibleProject(project: Row, target: SharedTarget): boolean {
  const category = record(project.category);
  return typeof project.id === 'string' && uuid.test(project.id)
    && (!target.projectId || sameId(project.id, target.projectId))
    && sameId(project.profile_id, target.profileId) && project.is_hidden === false
    && Boolean(visibleProfile(project.profile, target.profileId))
    && Boolean(category && typeof category.id === 'string' && uuid.test(category.id)
      && sameId(project.category_id, category.id)
      && (!target.categoryId || sameId(category.id, target.categoryId))
      && sameId(category.profile_id, target.profileId) && category.is_hidden === false);
}

async function readProject(target: SharedTarget, origin: string, config: PreviewConfiguration, signal: AbortSignal): Promise<Row | null> {
  const query = new URLSearchParams({
    select: projectSelect, limit: '1', profile_id: `eq.${target.profileId}`, is_hidden: 'eq.false',
    'profile.id': `eq.${target.profileId}`, 'profile.is_private': 'eq.false',
    'category.profile_id': `eq.${target.profileId}`, 'category.is_hidden': 'eq.false',
    'attachments.order': 'is_cover.desc,position.asc,id.asc', 'attachments.limit': String(MAX_PROJECT_ATTACHMENTS),
  });
  if (target.categoryId) query.set('category_id', `eq.${target.categoryId}`);
  if (target.projectId) query.set('id', `eq.${target.projectId}`);
  else {
    // The profile wall stores an explicit order using negative positions.
    // Ordinary published projects otherwise appear newest first.
    query.set('is_pinned', 'eq.true');
    query.set('order', 'position.asc,published_at.desc,id.asc');
  }
  let rows = await readRows('projects', query, origin, config, signal);
  if (!target.projectId && rows?.length === 0) {
    query.delete('is_pinned');
    query.set('position', 'lt.0');
    rows = await readRows('projects', query, origin, config, signal);
  }
  if (!target.projectId && rows?.length === 0) {
    query.delete('position');
    query.set('order', 'published_at.desc,id.asc');
    rows = await readRows('projects', query, origin, config, signal);
  }
  return rows?.length === 1 && visibleProject(rows[0], target) ? rows[0] : null;
}

export function coverImage(project: Row, profileId: string): Preview['image'] | null {
  const thumbnail = readCoverThumbnail(project.cover_thumbnail, profileId, String(project.id));
  const selected = thumbnail?.social ?? thumbnail?.variants.find(item => item.size === 800);
  if (thumbnail && selected) return { path: selected.path, width: selected.width, height: selected.height, public: thumbnail.bucket === 'project-covers', alt: text(project.title, 120) || 'Project cover' };
  if (!Array.isArray(project.attachments) || project.attachments.length > MAX_PROJECT_ATTACHMENTS) return null;
  const attachments = project.attachments.map(record);
  if (attachments.some(row => !row || !sameId(row.project_id, String(project.id)))) return null;
  const ordered = (attachments as Row[]).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  const cover = ordered.find(row => row.is_cover === true) ?? ordered.find(row => row.kind === 'image') ?? ordered[0];
  const metadata = record(cover?.metadata);
  if (!cover || !metadata || typeof cover.id !== 'string' || !cover.id) return null;
  const alt = text(project.title, 120) || 'Project cover';
  if (cover.kind === 'image') {
    if (metadata.multipart != null || typeof cover.storage_path !== 'string' || cover.storage_path.length > 1024) return null;
    if (!new RegExp(`^${profileId}/${UUID}/[a-z0-9][a-z0-9._-]*\\.(?:jpe?g|png|webp|gif|avif)$`, 'i').test(cover.storage_path)) return null;
    if (typeof cover.mime_type !== 'string' || !/^image\/(?:jpeg|png|webp|gif|avif)$/i.test(cover.mime_type)) return null;
    if (!dimension(metadata.widthPixels) || !dimension(metadata.heightPixels)) return null;
    return { path: cover.storage_path, width: metadata.widthPixels, height: metadata.heightPixels, alt };
  }
  if (cover.kind !== 'document' || cover.mime_type !== 'application/pdf' || !Array.isArray(metadata.renderedPages)) return null;
  const chosenPage = dimension(metadata.coverPageNumber) ? metadata.coverPageNumber : 1;
  const page = metadata.renderedPages.map(record).find(row => row && row.attachmentId === cover.id && row.withinDocumentIndex === chosenPage);
  if (!page || typeof page.storagePath !== 'string' || !dimension(page.width) || !dimension(page.height)) return null;
  // Accept the existing renderer and its lease-scoped successor, never another
  // project's objects, an original PDF, video, or multipart manifest.
  if (!new RegExp(`^posts/${project.id}/pages/(?:${UUID}/${UUID}/)?page_[1-9][0-9]*\\.webp$`, 'i').test(page.storagePath)) return null;
  return { path: page.storagePath, width: page.width, height: page.height, alt };
}

function profileImage(profile: Row | null, profileId: string, origin: string): Preview['image'] | null {
  if (!profile || typeof profile.avatar_url !== 'string') return null;
  try {
    const url = new URL(profile.avatar_url);
    const prefix = '/storage/v1/object/public/avatars/';
    if (url.origin !== origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return null;
    const path = url.pathname.slice(prefix.length);
    if (!new RegExp(`^${profileId}/[a-zA-Z0-9._-]+$`, 'i').test(path) || path.endsWith('/..') || path.endsWith('/.')) return null;
    return { path, public: true, avatar: true, width: 800, height: 800, alt: `${text(profile.name, 80)} profile picture` };
  } catch { return null; }
}

async function readPublicPreview(target: SharedTarget, origin: string, config: PreviewConfiguration, signal: AbortSignal): Promise<Preview | null> {
  let profile: Row | null = null;
  let category: Row | null = null;
  if (!target.projectId) {
    const query = new URLSearchParams({ limit: '1', id: `eq.${target.categoryId ?? target.profileId}` });
    if (target.categoryId) {
      query.set('select', 'id,profile_id,label,blurb,is_hidden,profile:profiles!inner(id,name,handle,headline,portfolio_headline,school,avatar_url,is_private)');
      query.set('profile_id', `eq.${target.profileId}`);
      query.set('is_hidden', 'eq.false');
      query.set('profile.id', `eq.${target.profileId}`);
      query.set('profile.is_private', 'eq.false');
    } else {
      query.set('select', 'id,name,handle,headline,portfolio_headline,school,avatar_url,is_private');
      query.set('is_private', 'eq.false');
    }
    const rows = await readRows(target.categoryId ? 'portfolio_categories' : 'profiles', query, origin, config, signal);
    if (rows?.length !== 1 || !sameId(rows[0].id, target.categoryId ?? target.profileId)) return null;
    if (target.categoryId) {
      category = rows[0];
      if (!sameId(category.profile_id, target.profileId) || category.is_hidden !== false) return null;
      profile = visibleProfile(category.profile, target.profileId);
    } else profile = visibleProfile(rows[0], target.profileId);
    if (!profile) return null;
  }
  const project = await readProject(target, origin, config, signal);
  if (!project) return null;
  // This final project read also revalidates the profile and collection after
  // the initial lookup, so a prior cached shell never grants public visibility.
  profile = visibleProfile(project.profile, target.profileId);
  const creator = text(profile?.name, 80);
  const image = !target.categoryId ? profileImage(profile, target.profileId, origin) : coverImage(project, target.profileId);
  if (!creator || !image) return null;
  const title = text(target.projectId ? project.title : category?.label, 120);
  if (target.categoryId && !title) return null;
  const countResponse = !target.categoryId ? await fetch(`${origin}/rest/v1/projects?${new URLSearchParams({ select: 'id,category:portfolio_categories!inner(id,is_hidden)', profile_id: `eq.${target.profileId}`, is_hidden: 'eq.false', 'category.is_hidden': 'eq.false' })}`, { method: 'HEAD', headers: { apikey: config.publishableKey, Prefer: 'count=exact' }, credentials: 'omit', cache: 'no-store', redirect: 'manual', signal }) : null;
  const count = countResponse?.ok ? Number(countResponse.headers.get('content-range')?.split('/')[1]) : NaN;
  if (!target.categoryId && (!Number.isSafeInteger(count) || count < 1)) return null;
  const headline = typeof profile?.portfolio_headline === 'string' ? profile.portfolio_headline : typeof profile?.headline === 'string' ? profile.headline.split(/\r?\n/).find(line => line.trim()) ?? '' : '';
  const card = shareCardText(creator, '', Number.isFinite(count) ? count : 1, '');
  return {
    handle: typeof profile?.handle === 'string' ? profile.handle : undefined,
    title: title ? `${title} — ${creator} | Portalink` : card.title,
    description: !target.categoryId ? card.description : text(plainFormattedText(String((target.projectId ? project.summary : category?.blurb) ?? '')), 160)
      || text(headline, 80) || text(plainFormattedText(typeof project.summary === 'string' ? project.summary : ''), 160)
      || `Explore ${creator}'s creative work on Portalink.`,
    type: target.categoryId ? 'article' : 'profile', image,
  };
}

export async function signImage(path: string, origin: string, config: PreviewConfiguration, signal: AbortSignal, fetcher: typeof fetch = fetch, expiresIn = 21_600): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const expectedPath = `/storage/v1/object/sign/project-media/${encodedPath}`;
  const response = await fetcher(`${origin}${expectedPath}`, {
    method: 'POST', headers: { apikey: config.publishableKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ expiresIn }), cache: 'no-store', redirect: 'manual', signal,
  });
  if (!response.ok) return null;
  const body = record(await response.json());
  const value = body?.signedURL;
  if (typeof value !== 'string' || value.length > 8192 || value.includes('\\')
    || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  const signed = new URL(value.startsWith('/object/') ? `/storage/v1${value}` : value, origin);
  if (signed.origin !== origin || signed.pathname !== expectedPath || signed.username || signed.password || signed.hash
    || [...signed.searchParams.keys()].length !== 1 || !signed.searchParams.get('token')) return null;
  return signed.href;
}

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(value => value !== undefined);
}

function rewriteHead(html: string, preview: Preview, image: string, canonical: string): string {
  return html.replace(/(<head\b[^>]*>)([\s\S]*?)(<\/head\s*>)/i, (_match, open: string, head: string, close: string) => {
    const cleaned = head.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, '').replace(/<(?:meta|link)\b[^>]*>/gi, tag => {
      if (/^<link\b/i.test(tag)) return attribute(tag, 'rel')?.toLowerCase().split(/\s+/).includes('canonical') ? '' : tag;
      const name = (attribute(tag, 'name') ?? attribute(tag, 'property'))?.toLowerCase();
      return name && (['description', 'og:title', 'og:description', 'og:type', 'og:url', 'twitter:title', 'twitter:description', 'twitter:card'].includes(name)
        || name.startsWith('og:image') || name.startsWith('twitter:image')) ? '' : tag;
    });
    const tags = [
      `<title>${escapeHtml(preview.title)}</title>`,
      ...[
        ['description', preview.description], ['og:title', preview.title], ['og:description', preview.description],
        ['og:type', preview.type], ['og:url', canonical], ['og:image', image],
        ['og:image:width', String(preview.image.width)], ['og:image:height', String(preview.image.height)], ['og:image:alt', preview.image.alt],
        ['twitter:card', 'summary_large_image'], ['twitter:title', preview.title], ['twitter:description', preview.description],
        ['twitter:image', image], ['twitter:image:alt', preview.image.alt],
      ].map(([name, content]) => `<meta ${name.startsWith('og:') ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" />`),
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    ].join('\n');
    return `${open}${cleaned}\n${tags}\n${close}`;
  });
}

/** Personalized public share heads use existing anonymous reads and media
 * signing. Unavailable/private/coverless records retain the generic SPA shell. */
export async function withSharedPreview(response: Response, request: Request, config: PreviewConfiguration, resolvedProfileId?: string): Promise<Response> {
  const url = new URL(request.url);
  const handleProject = /^\/[^/]+\/c\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/?$/i.exec(url.pathname);
  const match = url.pathname.match(sharedRoute) ?? (resolvedProfileId ? ['', resolvedProfileId, handleProject?.[1], handleProject?.[2]] : null);
  if (!match || !prefersHtml(request.headers.get('accept')) || (request.method !== 'GET' && request.method !== 'HEAD')
    || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  // Never expose a browser/edge cache that bypasses the anonymous privacy read.
  headers.set('cache-control', 'private, no-store');
  for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) headers.delete(name);
  if (request.method === 'HEAD') return new Response(null, { status: response.status, headers });
  const shell = await response.text();
  const cacheKey = `${url.origin}${url.pathname}`;
  let html = shell;
  try {
    const origin = serviceOrigin(config);
    const signal = AbortSignal.timeout(2_000);
    const preview = origin && config.publishableKey ? await readPublicPreview({ profileId: match[1], categoryId: match[2], projectId: match[3] }, origin, config, signal) : null;
    if (preview && origin && /<head\b[^>]*>[\s\S]*?<\/head\s*>/i.test(shell)) {
      const configuration = `${origin}\n${config.publishableKey}`;
      const fingerprint = JSON.stringify(preview);
      const cached = previewCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now() && cached.configuration === configuration && cached.fingerprint === fingerprint && cached.shell === shell) {
        html = cached.html;
      } else {
        const image = preview.image.public ? `${url.origin}/media/${preview.image.avatar ? 'avatars' : 'covers'}/${preview.image.path}` : await signImage(preview.image.path, origin, config, signal);
        if (image) {
          html = rewriteHead(shell, preview, image, `${url.origin}${url.pathname.replace(/\/$/, '')}`);
          previewCache.delete(cacheKey);
          previewCache.set(cacheKey, { configuration, fingerprint, shell, html, expiresAt: Date.now() + CACHE_MILLISECONDS });
          while (previewCache.size > MAX_CACHE_ENTRIES) {
            const oldest = previewCache.keys().next().value;
            if (oldest === undefined) break;
            previewCache.delete(oldest);
          }
        }
      }
    }
  } catch {
    // An optional preview lookup must never prevent the portfolio from opening.
  }
  if (html === shell) previewCache.delete(cacheKey);
  return new Response(html, { status: response.status, headers });
}

/** The sheet consumes precisely the same anonymous visibility read and card fields as crawlers. */
export async function readPortfolioCard(profileId: string, siteOrigin: string, config: PreviewConfiguration): Promise<PortfolioCard | null> {
  if (!uuid.test(profileId)) return null;
  const origin = serviceOrigin(config);
  if (!origin) return null;
  const signal = AbortSignal.timeout(5000);
  const preview = await readPublicPreview({ profileId }, origin, config, signal);
  if (!preview) return null;
  const image = preview.image.public ? `${siteOrigin}/media/${preview.image.avatar ? 'avatars' : 'covers'}/${preview.image.path}` : await signImage(preview.image.path, origin, config, signal);
  return { title: preview.title, description: preview.description, image, width: preview.image.width, height: preview.image.height, url: new URL(portfolioPath(profileId, preview.handle), siteOrigin).href };
}
