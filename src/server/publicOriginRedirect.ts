import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
import { isPublicSharePath } from '../features/sharing/shareModel';

const LEGACY_HOST = 'portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const PREVIEW_CRAWLER = /(?:facebookexternalhit|facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|SkypeUriPreview|Pinterestbot|Googlebot|bingbot|Applebot)/i;
const AUTH_PARAMETERS = new Set([
  'auth', 'code', 'state', 'nonce', 'token', 'token_hash', 'access_token', 'refresh_token',
  'id_token', 'provider_token', 'provider_refresh_token', 'session', 'session_id',
  'type', 'entry', 'onboarding_return', 'error', 'error_code', 'error_description',
  'expires_at', 'expires_in', 'token_type',
]);

/** Public lookup never consumes a bearer or an Auth-return URL. */
export function canResolvePublicAddress(request: Request): boolean {
  if (!['GET', 'HEAD'].includes(request.method)
    || request.headers.has('authorization') || request.headers.has('proxy-authorization')) return false;
  const url = new URL(request.url);
  if (url.username || url.password) return false;
  for (const key of url.searchParams.keys()) {
    if (AUTH_PARAMETERS.has(key.toLowerCase())) return false;
  }
  return true;
}

/** Browser fragments are invisible to HTTP; let the document guard inspect them. */
export function canRedirectPublicRequest(request: Request): boolean {
  if (!canResolvePublicAddress(request)) return false;
  const url = new URL(request.url);
  const documentRequest = request.headers.get('sec-fetch-dest')?.toLowerCase() === 'document'
    || /(?:^|,)\s*text\/html(?:\s*;|,|$)/i.test(request.headers.get('accept') ?? '');
  const guardedPage = isPublicSharePath(url.pathname) || /^\/cite(?:\/|$)/.test(url.pathname);
  return !(url.hostname === LEGACY_HOST && guardedPage && documentRequest
    && !PREVIEW_CRAWLER.test(request.headers.get('user-agent') ?? ''));
}

/** Only the observed legacy host's public pages move; root Auth fragments are invisible here. */
export function publicOriginRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== LEGACY_HOST || !canRedirectPublicRequest(request)) return null;
  const publicPage = isPublicSharePath(url.pathname) || /^\/cite(?:\/|$)/.test(url.pathname)
    || ['/licenses/citable-v1', '/licenses/view-only-v1', '/sitemap.xml'].includes(url.pathname);
  if (!publicPage) return null;
  // Assigning the authority preserves the exact encoded path/search and cannot
  // interpret a leading // in a user path as a different destination host.
  const destination = new URL(request.url), official = new URL(PUBLIC_ORIGIN);
  destination.protocol = official.protocol;
  destination.host = official.host;
  // Plain-text/XML documents cannot run a fragment-aware entry guard. An
  // explicit empty fragment prevents browsers inheriting Auth fragment tokens.
  const plainDocument = ['/licenses/citable-v1', '/licenses/view-only-v1', '/sitemap.xml'].includes(url.pathname);
  const location = plainDocument ? `${destination.origin}${destination.pathname}${destination.search}#` : destination.href;
  return new Response(null, { status: 301, headers: {
    location, 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer',
  } });
}
