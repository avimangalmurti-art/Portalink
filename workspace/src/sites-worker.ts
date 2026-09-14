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
let schemaReady: Promise<void> | null = null

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
  const pageIndex = Number(value.pageIndex)
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 10_000) {
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

async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS media_engagements (
        account_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        page_index INTEGER NOT NULL CHECK (page_index >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('like', 'save', 'repost')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_id, project_id, attachment_id, page_index, kind)
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_engagements_target
        ON media_engagements(project_id, attachment_id, page_index, kind)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS media_comments (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        attachment_id TEXT NOT NULL,
        page_index INTEGER NOT NULL CHECK (page_index >= 0),
        author_name TEXT NOT NULL,
        author_avatar_url TEXT,
        body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_comments_target_created
        ON media_comments(project_id, attachment_id, page_index, created_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_media_comments_account
        ON media_comments(account_id)`),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null
      throw error
    })
  }
  return schemaReady
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
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization,
      apikey: SUPABASE_KEY,
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    throw new Response(JSON.stringify({ error: 'Your session has expired. Sign in again to continue.' }), { status: 401, headers: JSON_HEADERS })
  }
  return response.json() as Promise<AuthenticatedUser>
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
  const values = [target.projectId, target.attachmentId, target.pageIndex]
  const [countRows, ownRows, commentRows] = await Promise.all([
    db.prepare(`SELECT kind, COUNT(*) AS total FROM media_engagements
      WHERE project_id = ? AND attachment_id = ? AND page_index = ? GROUP BY kind`)
      .bind(...values).all<{ kind: EngagementKind; total: number }>(),
    user
      ? db.prepare(`SELECT kind FROM media_engagements
          WHERE account_id = ? AND project_id = ? AND attachment_id = ? AND page_index = ?`)
          .bind(user.id, ...values).all<{ kind: EngagementKind }>()
      : Promise.resolve({ results: [] }),
    db.prepare(`SELECT id, account_id, author_name, author_avatar_url, body, created_at
      FROM media_comments WHERE project_id = ? AND attachment_id = ? AND page_index = ?
      ORDER BY created_at ASC LIMIT 200`)
      .bind(...values).all<{
        id: string
        account_id: string
        author_name: string
        author_avatar_url: string | null
        body: string
        created_at: string
      }>(),
  ])
  const counts = { like: 0, save: 0, repost: 0 }
  for (const row of countRows.results ?? []) counts[row.kind] = Number(row.total ?? 0)
  const own = new Set((ownRows.results ?? []).map((row) => row.kind))
  return {
    engaged: { like: own.has('like'), save: own.has('save'), repost: own.has('repost') },
    counts,
    comments: (commentRows.results ?? []).map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url,
      createdAt: row.created_at,
      canDelete: user?.id === row.account_id,
    })),
  }
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 16_384) throw new Error('Request is too large.')
  return request.json() as Promise<Record<string, unknown>>
}

async function handleMediaInteractions(request: Request, db: D1Database): Promise<Response> {
  await ensureSchema(db)
  const url = new URL(request.url)

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
      pageIndex: Number(url.searchParams.get('pageIndex')),
    })
    const user = await authenticatedUser(request, false)
    return json(await interactionRecord(db, target, user))
  }

  if (request.method === 'POST' && url.pathname === '/api/media-interactions/engagement') {
    const user = (await authenticatedUser(request, true))!
    const body = await requestBody(request)
    const target = parseTarget(body)
    const kind = body.kind
    const engaged = body.engaged
    if (!ENGAGEMENT_KINDS.includes(kind as EngagementKind) || typeof engaged !== 'boolean') throw new Error('Invalid engagement action.')
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
    await db.prepare(`DELETE FROM media_comments WHERE id = ? AND account_id = ?`).bind(commentId, user.id).run()
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
    if (request.method === 'GET' && accept.includes('text/html')) {
      const appShellUrl = new URL('/', request.url)
      return environment.ASSETS.fetch(new Request(appShellUrl, request))
    }

    return environment.ASSETS.fetch(request)
  },
}

export default worker
