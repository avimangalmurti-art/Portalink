import { isSharedPreviewPath, prefersHtml, withSharedPreview } from './server/sharedPreview';

interface StaticAssets {
  fetch(request: Request): Promise<Response>
}

interface D1Result<T = unknown> {
  results?: T[]
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<unknown>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<unknown>
}

interface SitesEnvironment {
  ASSETS: StaticAssets
  DB?: D1Database
}

type EngagementKind = 'like' | 'save' | 'repost'
type AuthenticatedUser = {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}
type Target = {
  projectId: string
  attachmentId: string
  pageIndex: number
  label?: string
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''
const ENGAGEMENT_KINDS: EngagementKind[] = ['like', 'save', 'repost']
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function boundedText(value: unknown, name: string, max = 160): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new Error(`Invalid ${name}.`)
  }
  return value
}

function parseTarget(value: Partial<Target>): Target {
  const pageIndex = value.pageIndex
  if (typeof pageIndex !== 'number' || !Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 10_000) {
    throw new Error('Invalid page position.')
  }
  return {
    projectId: boundedText(value.projectId, 'project'),
    // Persisted attachments deliberately use their full storage path as the
    // stable id. That path contains the profile, draft, generated object id,
    // and original filename, so a valid uploaded page can exceed the generic
    // 160-character text limit even though the renderer can load it normally.
    attachmentId: boundedText(value.attachmentId, 'media item', 1_024),
    pageIndex,
    label: typeof value.label === 'string' ? value.label.slice(0, 240) : undefined,
  }
}

async function authenticatedUser(request: Request, required: boolean): Promise<AuthenticatedUser | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    if (required) throw new Response(JSON.stringify({ error: 'Sign in to continue.' }), { status: 401, headers: JSON_HEADERS })
    return null
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Response(JSON.stringify({ error: 'Account verification is temporarily unavailable.' }), { status: 503, headers: JSON_HEADERS })
  }
  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization, apikey: SUPABASE_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw json({ error: 'Account verification is temporarily unavailable.' }, 503)
  }
  if (response.status >= 500 || response.status === 429) {
    throw json({ error: 'Account verification is temporarily unavailable.' }, 503)
  }
  if (!response.ok) {
    throw new Response(JSON.stringify({ error: 'Your session has expired. Sign in again to continue.' }), { status: 401, headers: JSON_HEADERS })
  }
  const user = await response.json().catch(() => null) as AuthenticatedUser | null
  if (!user || typeof user.id !== 'string' || !user.id) {
    throw json({ error: 'Account verification is temporarily unavailable.' }, 503)
  }
  return user
}

type ReadableAttachment = { id: string; kind: string; position: number; page_count?: unknown }
type ReadableProject = { id: string; category: { id: string }; attachments: ReadableAttachment[] }

/**
 * D1 has no Supabase RLS of its own. Resolve the real project, portal and media
 * through their existing SELECT policies using this request's identity BEFORE
 * touching activity. One bounded query covers the whole batch, with no access
 * cache that could survive a revoked follow or a privacy change.
 */
async function requireReadableTargets(request: Request, targets: Target[], user: AuthenticatedUser | null): Promise<void> {
  const unavailable = () => json({ error: 'Page access could not be verified. Please try again.' }, 503)
  if (!SUPABASE_URL || !SUPABASE_KEY) throw unavailable()
  const ids = [...new Set(targets.map(target => target.projectId))]
  const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/projects`)
  endpoint.search = new URLSearchParams({
    select: 'id,category:portfolio_categories!inner(id),attachments:project_attachments(id,kind,position,page_count:metadata->pageCount)',
    id: `in.(${ids.map(quote).join(',')})`,
    limit: String(ids.length),
    // Match the viewer's image sequence (all images in attachment position order).
    'attachments.order': 'position.asc',
    // Existing publishing permits 105 files. An extra row detects an unexpected
    // oversized response instead of authorizing against a truncated sequence.
    'attachments.limit': '106',
  }).toString()
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, accept: 'application/json' }
  // With no bearer, the publishable key selects the anonymous RLS role. Never
  // substitute a service credential or another account's token.
  if (user) {
    const authorization = request.headers.get('authorization')
    if (!authorization) throw unavailable()
    headers.authorization = authorization
  }
  let projects: ReadableProject[]
  try {
    const response = await fetch(endpoint.toString(), { headers, signal: AbortSignal.timeout(8_000) })
    if (!response.ok) throw new Error()
    const data: unknown = await response.json()
    if (!Array.isArray(data) || data.length > ids.length || data.some(project =>
      !project || typeof project.id !== 'string' || !ids.includes(project.id)
      || !project.category || typeof project.category.id !== 'string'
      || !Array.isArray(project.attachments) || project.attachments.length > 105
      || project.attachments.some((attachment: Partial<ReadableAttachment> | null) => !attachment
        || typeof attachment.id !== 'string' || typeof attachment.kind !== 'string'
        || !Number.isInteger(attachment.position)
        || (attachment.page_count != null && (typeof attachment.page_count !== 'number'
          || !Number.isInteger(attachment.page_count) || attachment.page_count < 0))))) throw new Error()
    projects = data as ReadableProject[]
  } catch {
    // Never fall back to D1 or expose upstream error bodies/URLs on failure.
    throw unavailable()
  }
  for (const target of targets) {
    const project = projects.find(item => item.id === target.projectId)
    const attachment = project?.attachments.find(item => item.id === target.attachmentId)
    const isImagePage = attachment?.kind === 'image'
      && project?.attachments.filter(item => item.kind === 'image').findIndex(item => item.id === attachment.id) === target.pageIndex
    // Original PDFs can render in the browser before processing has recorded a
    // count. Keep that existing path bounded by parseTarget; enforce a persisted
    // positive count when present. This is not a server inspection of PDF bytes.
    const isDocumentPage = attachment?.kind === 'document'
      && (!(typeof attachment.page_count === 'number' && attachment.page_count > 0) || target.pageIndex < attachment.page_count)
    if (!isImagePage && !isDocumentPage) throw json({ error: 'This page is not available.' }, 404)
  }
}

function authorIdentity(user: AuthenticatedUser): { name: string; avatarUrl: string | null } {
  const metadata = user.user_metadata ?? {}
  const nameCandidates = [metadata.name, metadata.full_name, metadata.display_name]
  const name = nameCandidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?? user.email?.split('@')[0]
    ?? 'Portalink member'
  const avatar = [metadata.avatar_url, metadata.picture].find((value): value is string => typeof value === 'string' && /^https:\/\//i.test(value))
  return { name: name.slice(0, 100), avatarUrl: avatar?.slice(0, 500) ?? null }
}

async function interactionRecord(db: D1Database, target: Target, user: AuthenticatedUser | null) {
  const [item] = await interactionRecords(db, [target], user);
  return item.record;
}

/** One bounded read for the visible pages, rather than three queries per page. */
async function interactionRecords(db: D1Database, targets: Target[], user: AuthenticatedUser | null) {
  const requested = `WITH requested(project_id, attachment_id, page_index) AS (VALUES ${targets.map(() => '(?, ?, ?)').join(', ')})`;
  const values = targets.flatMap((target) => [target.projectId, target.attachmentId, target.pageIndex]);
  const [engagements, comments] = await Promise.all([
    db.prepare(`${requested}
      SELECT e.project_id, e.attachment_id, e.page_index, e.kind, COUNT(*) AS total,
        MAX(CASE WHEN e.account_id = ? THEN 1 ELSE 0 END) AS own
      FROM requested r JOIN media_engagements e USING(project_id, attachment_id, page_index)
      GROUP BY e.project_id, e.attachment_id, e.page_index, e.kind`)
      .bind(...values, user?.id ?? '').all<{ project_id: string; attachment_id: string; page_index: number; kind: EngagementKind; total: number; own: number }>(),
    db.prepare(`${requested}, ranked AS (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.project_id, c.attachment_id, c.page_index ORDER BY c.created_at, c.id) AS position
      FROM requested r JOIN media_comments c USING(project_id, attachment_id, page_index)
    ) SELECT * FROM ranked WHERE position <= 200 ORDER BY created_at, id`)
      .bind(...values).all<{ project_id: string; attachment_id: string; page_index: number; id: string; body: string; author_name: string; author_avatar_url: string | null; created_at: string; account_id: string }>(),
  ]);
  return targets.map((target) => {
    const matches = (row: { project_id: string; attachment_id: string; page_index: number }) => row.project_id === target.projectId && row.attachment_id === target.attachmentId && row.page_index === target.pageIndex;
    const counts = { like: 0, save: 0, repost: 0 };
    const engaged = { like: false, save: false, repost: false };
    for (const row of (engagements.results ?? []).filter(matches)) {
      counts[row.kind] = Number(row.total);
      engaged[row.kind] = Boolean(row.own);
    }
    return { target, record: { counts, engaged, comments: (comments.results ?? []).filter(matches).map((row) => ({
      id: row.id, body: row.body, authorName: row.author_name, authorAvatarUrl: row.author_avatar_url,
      createdAt: row.created_at, canDelete: user?.id === row.account_id,
    })) } };
  });
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 16_384) throw new Error('Request is too large.')
  return request.json() as Promise<Record<string, unknown>>
}

async function handleMediaInteractions(request: Request, db: D1Database): Promise<Response> {
  // Schema is owned by drizzle migrations. Existing deployed D1 tables and
  // records are reused; page reads never perform DDL on a cold isolate.
  const url = new URL(request.url)

  if (request.method === 'POST' && url.pathname === '/api/media-interactions/batch') {
    const body = await requestBody(request);
    // Twenty targets stay below D1's statement parameter limit, including identity.
    if (!Array.isArray(body.targets) || body.targets.length < 1 || body.targets.length > 20) throw new Error('Request between 1 and 20 pages.');
    const targets = body.targets.map((value) => parseTarget(value && typeof value === 'object' ? value : {}));
    const unique = [...new Map(targets.map((target) => [JSON.stringify([target.projectId, target.attachmentId, target.pageIndex]), target])).values()];
    const user = await authenticatedUser(request, false);
    await requireReadableTargets(request, unique, user);
    return json({ items: await interactionRecords(db, unique, user) });
  }

  if (url.pathname === '/api/media-interactions/saved') {
    // Account identity comes only from the verified session, never the query.
    const user = (await authenticatedUser(request, true))!
    if (request.method === 'GET') {
      const rawCursor = url.searchParams.get('cursor')
      let cursor: { time: string; row: number } | null = null
      if (rawCursor) {
        try {
          const parsed = JSON.parse(atob(rawCursor))
          if (rawCursor.length > 256 || typeof parsed.time !== 'string' || parsed.time.length > 40 || !Number.isSafeInteger(parsed.row) || parsed.row < 1) throw new Error()
          cursor = parsed
        } catch { return json({ error: 'Invalid saved-pages cursor.' }, 400) }
      }
      const result = await db.prepare(`SELECT rowid AS saved_row, project_id, attachment_id, page_index, created_at
        FROM media_engagements WHERE account_id = ? AND kind = 'save'
        ${cursor ? 'AND (created_at < ? OR (created_at = ? AND rowid < ?))' : ''}
        ORDER BY created_at DESC, rowid DESC LIMIT 25`)
        .bind(user.id, ...(cursor ? [cursor.time, cursor.time, cursor.row] : []))
        .all<{ saved_row: number; project_id: string; attachment_id: string; page_index: number; created_at: string }>()
      const rows = result.results ?? []
      const page = rows.slice(0, 24)
      const last = page[page.length - 1]
      return json({
        items: page.map((row) => ({ projectId: row.project_id, attachmentId: row.attachment_id, pageIndex: row.page_index, savedAt: row.created_at })),
        nextCursor: rows.length > 24 && last ? btoa(JSON.stringify({ time: last.created_at, row: last.saved_row })) : null,
      })
    }
    if (request.method === 'DELETE') {
      const target = parseTarget(await requestBody(request))
      // Unsave remains possible when the project/page is no longer accessible.
      await db.prepare(`DELETE FROM media_engagements
        WHERE account_id = ? AND project_id = ? AND attachment_id = ? AND page_index = ? AND kind = 'save'`)
        .bind(user.id, target.projectId, target.attachmentId, target.pageIndex).run()
      return json({ removed: true })
    }
    return json({ error: 'Method not allowed.' }, 405)
  }

  if (request.method === 'GET' && url.pathname === '/api/media-interactions') {
    const target = parseTarget({
      projectId: url.searchParams.get('projectId') ?? undefined,
      attachmentId: url.searchParams.get('attachmentId') ?? undefined,
      pageIndex: url.searchParams.get('pageIndex')?.trim() ? Number(url.searchParams.get('pageIndex')) : undefined,
    })
    const user = await authenticatedUser(request, false)
    await requireReadableTargets(request, [target], user)
    return json(await interactionRecord(db, target, user))
  }

  if (request.method === 'POST' && url.pathname === '/api/media-interactions/engagement') {
    const user = (await authenticatedUser(request, true))!
    const body = await requestBody(request)
    const target = parseTarget(body)
    const kind = body.kind
    const engaged = body.engaged
    if (!ENGAGEMENT_KINDS.includes(kind as EngagementKind) || typeof engaged !== 'boolean') throw new Error('Invalid engagement action.')
    await requireReadableTargets(request, [target], user)
    if (engaged) {
      await db.prepare(`INSERT OR IGNORE INTO media_engagements
        (account_id, project_id, attachment_id, page_index, kind) VALUES (?, ?, ?, ?, ?)`)
        .bind(user.id, target.projectId, target.attachmentId, target.pageIndex, kind).run()
    } else {
      await db.prepare(`DELETE FROM media_engagements
        WHERE account_id = ? AND project_id = ? AND attachment_id = ? AND page_index = ? AND kind = ?`)
        .bind(user.id, target.projectId, target.attachmentId, target.pageIndex, kind).run()
    }
    return json(await interactionRecord(db, target, user))
  }

  if (request.method === 'POST' && url.pathname === '/api/media-interactions/comments') {
    const user = (await authenticatedUser(request, true))!
    const body = await requestBody(request)
    const target = parseTarget(body)
    const comment = boundedText(body.body, 'comment', 1000).trim()
    if (!comment) throw new Error('Write something before posting.')
    await requireReadableTargets(request, [target], user)
    const author = authorIdentity(user)
    await db.prepare(`INSERT INTO media_comments
      (id, account_id, project_id, attachment_id, page_index, author_name, author_avatar_url, body)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), user.id, target.projectId, target.attachmentId, target.pageIndex, author.name, author.avatarUrl, comment).run()
    return json(await interactionRecord(db, target, user), 201)
  }

  const deleteMatch = url.pathname.match(/^\/api\/media-interactions\/comments\/([^/]+)$/)
  if (request.method === 'DELETE' && deleteMatch) {
    const user = (await authenticatedUser(request, true))!
    const body = await requestBody(request)
    const target = parseTarget(body)
    const commentId = boundedText(decodeURIComponent(deleteMatch[1]), 'comment')
    await requireReadableTargets(request, [target], user)
    await db.prepare(`DELETE FROM media_comments WHERE id = ? AND account_id = ?
      AND project_id = ? AND attachment_id = ? AND page_index = ?`)
      .bind(commentId, user.id, target.projectId, target.attachmentId, target.pageIndex).run()
    return json(await interactionRecord(db, target, user))
  }

  return json({ error: 'Not found.' }, 404)
}

const worker = {
  async fetch(request: Request, environment: SitesEnvironment): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/media-interactions')) {
      if (!environment.DB) return json({ error: 'Page activity is not available yet.' }, 503)
      try {
        return await handleMediaInteractions(request, environment.DB)
      } catch (error) {
        if (error instanceof Response) return error
        return json({ error: error instanceof Error ? error.message : 'That request could not be completed.' }, 400)
      }
    }

    const accept = request.headers.get('accept') ?? ''
    const asset = url.pathname.startsWith('/assets/');
    const shared = isSharedPreviewPath(url.pathname);
    const navigation = (request.method === 'GET' || request.method === 'HEAD') && !asset && (shared ? prefersHtml(accept) : accept.includes('text/html'));
    const assetRequest = navigation ? new Request(new URL('/', request.url), request) : request;
    if (navigation && shared) {
      assetRequest.headers.delete('if-none-match');
      assetRequest.headers.delete('if-modified-since');
    }
    const response = await environment.ASSETS.fetch(assetRequest);
    // Never cache a SPA fallback as a missing JS/CSS asset.
    if (asset && response.headers.get('content-type')?.includes('text/html')) {
      return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const headers = new Headers(response.headers);
    if (response.ok && asset && /-[\w-]{8,}\.[a-z\d]+$/i.test(url.pathname)) {
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    } else if (navigation || response.headers.get('content-type')?.includes('text/html')) {
      headers.set('cache-control', 'no-cache');
    }
    return withSharedPreview(new Response(response.body, { status: response.status, statusText: response.statusText, headers }), request, {
      supabaseUrl: SUPABASE_URL, publishableKey: SUPABASE_KEY,
    });
  },
}

export default worker
