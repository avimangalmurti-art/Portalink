import { projectPageMap, REACH_BUCKETS, REF_CLASSES, READ_PERIODS, readPeriodSince, pageActionCopy, type ReadPeriod, type ReachPayload, type ReachSummary, type ReadPage, type ReadDetail } from '../features/reads/readSignal';
import type { Notification, ProjectAttachment } from '../types/domain';
export interface ReachStatement {
    bind(...values: unknown[]): ReachStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{
        results?: T[];
    }>;
    run(): Promise<unknown>;
}
export interface ReachDatabase {
    prepare(sql: string): ReachStatement;
    batch(statements: ReachStatement[]): Promise<unknown>;
}
type User = {
    id: string;
};
type Config = {
    supabaseUrl: string;
    publishableKey: string;
    authenticate: (request: Request, required: boolean) => Promise<User | null>;
    fetcher?: typeof fetch;
    assertDeletionWrite?: (accounts: string[], projects: string[]) => Promise<void>;
};
type ProjectRow = {
    id: string;
    profile_id: string;
    category_id: string;
    title: string;
    pdf_page_count: number | null;
    is_hidden: boolean;
    profile: {
        id: string;
        account_id: string;
        is_private: boolean;
    };
    category: {
        id: string;
        profile_id: string;
        is_hidden: boolean;
    };
    attachments: Array<{
        id: string;
        storage_path: string;
        kind: ProjectAttachment['kind'];
        position: number;
        metadata?: ProjectAttachment['metadata'];
    }>;
};
type Rollup = {
    day: string;
    opened: number;
    finished: number;
    max_page_hist: string;
    ref_counts: string;
};
type Action = {
    id: string;
    owner_account_id: string;
    actor_account_id: string;
    actor_profile_id: string;
    actor_name: string;
    project_id: string;
    attachment_id: string;
    page_index: number;
    kind: 'save' | 'comment';
    at: string;
    project_title: string;
    heading: string | null;
    target_path: string;
    comment_id: string | null;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, DAY = 86400000;
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
export const reachJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const unavailable = () => reachJson({ error: 'Reads are not available yet.' }, 503);
export function validateReachPayload(value: unknown): ReachPayload | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const row = value as Record<string, unknown>, keys = ['project_id', 'session_token', 'furthest_page', 'page_count', 'ref_class', 'vw_bucket'];
    if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key)))
        return null;
    if (typeof row.project_id !== 'string' || row.project_id.length!==36 || !UUID.test(row.project_id) || typeof row.session_token !== 'string' || row.session_token.length!==36 || !UUID.test(row.session_token))
        return null;
    if (!Number.isInteger(row.page_count) || Number(row.page_count) < 1 || Number(row.page_count) > 10000 || !Number.isInteger(row.furthest_page) || Number(row.furthest_page) < -1 || Number(row.furthest_page) >= Number(row.page_count))
        return null;
    if (!REF_CLASSES.includes(row.ref_class as ReachPayload['ref_class']) || !REACH_BUCKETS.includes(row.vw_bucket as ReachPayload['vw_bucket']))
        return null;
    return Object.fromEntries(keys.map(key => [key, row[key]])) as ReachPayload;
}
export async function boundedReachBody(request: Request): Promise<unknown> {
    if (Number(request.headers.get('content-length')) > 1024)
        throw reachJson({ error: 'Payload too large.' }, 413);
    if (!request.body)
        throw reachJson({ error: 'Invalid payload.' }, 400);
    const reader = request.body.getReader(), bytes = new Uint8Array(1024);
    let size = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            if (size + chunk.value.byteLength > 1024) {
                await reader.cancel();
                throw reachJson({ error: 'Payload too large.' }, 413);
            }
            bytes.set(chunk.value, size);
            size += chunk.value.byteLength;
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
    }
    catch (error) {
        throw error instanceof Response ? error : reachJson({ error: 'Invalid payload.' }, 400);
    }
    finally {
        reader.releaseLock();
    }
}
export async function sessionHash(token: string, project: string, day: string): Promise<string> {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${project}:${token}`));
    return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
const projectSelect = 'id,profile_id,category_id,title,pdf_page_count,is_hidden,profile:profiles!projects_profile_id_fkey!inner(id,account_id,is_private),category:portfolio_categories!inner(id,profile_id,is_hidden),attachments:project_attachments(id,storage_path,kind,position,metadata)';
async function supabaseRows<T>(config: Config, table: string, query: URLSearchParams, authorization?: string | null): Promise<T[]> {
    if (!config.supabaseUrl || !config.publishableKey)
        throw unavailable();
    const response = await (config.fetcher ?? fetch)(`${config.supabaseUrl}/rest/v1/${table}?${query}`, { headers: { apikey: config.publishableKey, accept: 'application/json', ...(authorization ? { authorization } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(8000) }).catch(() => { throw unavailable(); });
    if (!response.ok)
        throw unavailable();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows))
        throw unavailable();
    return rows as T[];
}
async function projectRows(config: Config, id?: string, authorization?: string | null, profileIds?: string[]): Promise<ProjectRow[]> {
    const query = new URLSearchParams({ select: projectSelect, 'attachments.order': 'position.asc', 'attachments.limit': '106', limit: '1001' });
    if (id)
        query.set('id', `eq.${id}`);
    if (profileIds)
        query.set('profile_id', `in.(${profileIds.join(',')})`);
    const rows = await supabaseRows<ProjectRow>(config, 'projects', query, authorization);
    if (rows.length > 1000 || rows.some(row => !row.profile || !row.category || !Array.isArray(row.attachments) || row.attachments.length > 105))
        throw unavailable();
    return rows;
}
export function pageMap(project: ProjectRow, reportedCount?: number): ReadPage[] {
    const attachments = project.attachments.map(a => ({ id: a.id, kind: a.kind, order: a.position, metadata: a.metadata }));
    const unknown = attachments.filter(a => a.kind === 'document' && !a.metadata?.pageCount);
    const total = project.pdf_page_count ? project.pdf_page_count + attachments.filter(a => a.kind !== 'document').length : reportedCount;
    const resolved: Record<string, number> = {};
    if (unknown.length === 1 && total) {
        const known = attachments.filter(a => a !== unknown[0]).reduce((n, a) => n + (a.kind === 'document' ? (a.metadata?.pageCount ?? 0) : 1), 0);
        resolved[unknown[0].id] = total - known;
    }
    return projectPageMap(attachments, resolved);
}
function publicProject(row: ProjectRow) { return !row.is_hidden && !row.profile.is_private && !row.category.is_hidden && row.category.profile_id === row.profile_id; }
export async function ownedProjects(request: Request, config: Config, id?: string): Promise<{
    user: User;
    projects: ProjectRow[];
}> {
    const user = await config.authenticate(request, true);
    if (!user)
        throw reachJson({ error: 'Sign in to continue.' }, 401);
    if (id && !UUID.test(id))
        throw reachJson({ error: 'Invalid project.' }, 400);
    const authorization = request.headers.get('authorization');
    const profiles = await supabaseRows<{
        id: string;
        account_id: string;
    }>(config, 'profiles', new URLSearchParams({ select: 'id,account_id', account_id: `eq.${user.id}`, limit: '100' }), authorization);
    const owned = profiles.filter(profile => profile.account_id === user.id && UUID.test(profile.id));
    if (!owned.length) {
        if (id)
            throw reachJson({ error: 'Not permitted.' }, 403);
        return { user, projects: [] };
    }
    const rows = await projectRows(config, id, authorization, owned.map(p => p.id));
    const projects = rows.filter(row => row.profile.account_id === user.id && owned.some(p => p.id === row.profile_id));
    if (id && (projects.length !== 1 || projects[0].id !== id))
        throw reachJson({ error: 'Not permitted.' }, 403);
    return { user, projects };
}
export async function ingestReach(request: Request, db: ReachDatabase | undefined, config: Config, options: {
    now?: () => number;
    random?: () => number;
} = {}): Promise<Response> {
    if (request.method !== 'POST')
        return reachJson({ error: 'Method not allowed.' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
        return reachJson({ error: 'Origin not allowed.' }, 403);
    try {
        const payload = validateReachPayload(await boundedReachBody(request));
        if (!payload)
            return reachJson({ error: 'Invalid reach payload.' }, 400);
        if (!db)
            return unavailable();
        // Anonymous read only: no cookies, bearer, account or request identity forwarded.
        const [project] = await projectRows(config, payload.project_id);
        if (!project || !publicProject(project))
            return reachJson({ error: 'Project not available.' }, 404);
        const pages = pageMap(project, payload.page_count);
        if (!pages.length || pages.length !== payload.page_count)
            return reachJson({ error: 'Page count is unavailable or has changed.' }, 409);
        const now = (options.now ?? Date.now)(), at = new Date(now).toISOString(), hash = await sessionHash(payload.session_token, project.id, at.slice(0, 10));
        await config.assertDeletionWrite?.([], [project.id]);
        await db.prepare(`INSERT INTO project_reach_events(id,at,project_id,session_hash,furthest_page,page_count,ref_class,vw_bucket) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(project_id,session_hash) DO UPDATE SET furthest_page=max(furthest_page,excluded.furthest_page)
      WHERE excluded.furthest_page>furthest_page AND excluded.page_count=page_count`).bind(crypto.randomUUID(), at, project.id, hash, payload.furthest_page, payload.page_count, payload.ref_class, payload.vw_bucket).run();
        if ((options.random ?? Math.random)() < .01) {
            const cutoff = new Date(now);
            cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
            await db.batch([
                db.prepare('DELETE FROM project_reach_events WHERE at < ?').bind(new Date(now - 30 * DAY).toISOString()),
                db.prepare('DELETE FROM project_reach_daily WHERE day < ?').bind(cutoff.toISOString().slice(0, 10)),
                db.prepare('DELETE FROM project_notification_reads WHERE read_at < ?').bind(new Date(now - 30 * DAY).toISOString()),
                db.prepare('DELETE FROM project_weekly_notes WHERE at < ?').bind(new Date(now - 30 * DAY).toISOString()),
            ]).catch(() => undefined);
        }
        return new Response(null, { status: 204, headers });
    }
    catch (error) {
        return error instanceof Response ? error : unavailable();
    }
}
function numbers(value: string): Record<string, number> { try {
    const result = JSON.parse(value);
    return Object.fromEntries(Object.entries(result).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) as Record<string, number>;
}
catch {
    return {};
} }
export function summarizeRollups(rows: Rollup[], pageCount: number, sevenDay: string) {
    const maxima = Array.from({ length: pageCount }, () => 0), reach = Array.from({ length: pageCount }, () => 0), refs: Record<string, number> = {}, weekly = { opened: 0, finished: 0, refs: {} as Record<string, number> };
    let opened = 0, finished = 0;
    for (const row of rows) {
        opened += row.opened;
        finished += row.finished;
        for (const [key, count] of Object.entries(numbers(row.max_page_hist))) {
            const end = Math.min(pageCount - 1, Number(key));
            if (Number.isInteger(end) && end >= 0) maxima[end] += count;
        }
        for (const [key, count] of Object.entries(numbers(row.ref_counts)))
            refs[key] = (refs[key] ?? 0) + count;
        if (row.day >= sevenDay) {
            weekly.opened += row.opened;
            weekly.finished += row.finished;
            for (const [key, count] of Object.entries(numbers(row.ref_counts)))
                weekly.refs[key] = (weekly.refs[key] ?? 0) + count;
        }
    }
    let cumulative=0;
    for(let page=pageCount-1;page>=0;page--){cumulative+=maxima[page];reach[page]=cumulative;}
    return { opened, finished, reach, refs, weekly };
}
export async function readProjectSummary(db: ReachDatabase, project: ProjectRow, now = Date.now(), period: ReadPeriod = '30d'): Promise<ReachSummary> {
    const reported = pageMap(project).length ? null : await db.prepare('SELECT max(page_count) count FROM project_reach_events WHERE project_id=?').bind(project.id).first<{
        count: number;
    }>();
    const pages = pageMap(project, reported?.count), since = readPeriodSince(period, now), seven = new Date(now - 6 * DAY).toISOString().slice(0, 10);
    const [rollups, saves, comments] = await Promise.all([
        db.prepare('SELECT day,opened,finished,max_page_hist,ref_counts FROM project_reach_daily WHERE project_id=? AND day>=? AND day<=?').bind(project.id, since, new Date(now).toISOString().slice(0, 10)).all<Rollup>(),
        db.prepare("SELECT attachment_id,page_index,count(*) count FROM media_engagements WHERE project_id=? AND kind='save' GROUP BY attachment_id,page_index").bind(project.id).all<{
            attachment_id: string;
            page_index: number;
            count: number;
        }>(),
        db.prepare('SELECT attachment_id,page_index,count(*) count FROM media_comments WHERE project_id=? GROUP BY attachment_id,page_index').bind(project.id).all<{
            attachment_id: string;
            page_index: number;
            count: number;
        }>(),
    ]);
    const counts = (rows: typeof saves) => {
      const map=new Map((rows.results??[]).map(row=>[`${row.attachment_id}:${row.page_index}`,row.count]));
      return pages.map(page=>map.get(`${page.attachmentId}:${page.pageIndex}`)??0);
    };
    const savedByPage = counts(saves), commentsByPage = counts(comments);
    const savedRows = await db.prepare("SELECT account_id,attachment_id,page_index FROM media_engagements WHERE project_id=? AND kind='save'").bind(project.id).all<{
        account_id: string;
        attachment_id: string;
        page_index: number;
    }>();
    const targets=new Set(pages.map(p=>`${p.attachmentId}:${p.pageIndex}`));
    const saved = new Set((savedRows.results ?? []).filter(row => targets.has(`${row.attachment_id}:${row.page_index}`)).map(row => row.account_id)).size;
    return { projectId: project.id, title: project.title, profileId: project.profile_id, categoryId: project.category_id, pageCount: pages.length, pages, ...summarizeRollups(rollups.results ?? [], pages.length, seven), saved, comments: commentsByPage.reduce((a, b) => a + b, 0), savedByPage, commentsByPage };
}
function groupPageActions(actions: Action[]): Action[][] {
    const groups: Action[][] = [], latest = new Map<string, Action[]>();
    for (const action of actions.slice().sort((a, b) => a.at.localeCompare(b.at))) {
        const key = action.kind === 'comment' ? action.id : `${action.project_id}:${action.attachment_id}:${action.page_index}`;
        const prior = latest.get(key);
        if (prior && Date.parse(action.at) - Date.parse(prior[0].at) < DAY)
            prior.push(action);
        else {
            const group = [action];
            groups.push(group);
            latest.set(key, group);
        }
    }
    return groups;
}
export function coalescePageActions(actions: Action[]): Notification[] {
    return groupPageActions(actions).map(group => { const first = group[0], last = group[group.length - 1]; return { id: `d1:page:${first.id}`, body: pageActionCopy(first.actor_name, first.kind, first.page_index, first.project_title, first.heading ?? undefined, new Set(group.map(a => a.actor_profile_id)).size), timestamp: last.at, isUnread: true, kind: 'system', targetPath: first.target_path, actorProfileId: group.length === 1 ? first.actor_profile_id : null }; });
}
async function summaries(db: ReachDatabase, projects: ProjectRow[], now = Date.now(), period: ReadPeriod = '30d'): Promise<ReachSummary[]> {
    const result: ReachSummary[] = [];
    for (let offset = 0; offset < projects.length; offset += 6)
        result.push(...await Promise.all(projects.slice(offset, offset + 6).map(p => readProjectSummary(db, p, now, period))));
    return result;
}
export async function handleReachRead(request: Request, db: ReachDatabase | undefined, config: Config): Promise<Response> {
    try {
        const url = new URL(request.url), id = url.searchParams.get('project_id') ?? undefined;
        const { user, projects } = await ownedProjects(request, config, id);
        const periodText = url.searchParams.get('period') ?? '30d';
        if (!READ_PERIODS.some(item => item.key === periodText)) return reachJson({ error: 'Invalid period.' }, 400);
        const period = periodText as ReadPeriod;
        if (!db)
            return unavailable();
        if (url.pathname === '/api/reach/summary' && request.method === 'GET') {
            if (!id)
                return reachJson({ error: 'Choose a project.' }, 400);
            const summary = await readProjectSummary(db, projects[0], Date.now(), period);
            const pageText = url.searchParams.get('page');
            if (pageText === null)
                return reachJson(summary);
            const page = Number(pageText);
            if (!Number.isInteger(page) || page < 0 || page >= summary.pages.length)
                return reachJson({ error: 'Invalid page.' }, 400);
            const target = summary.pages[page];
            const actions = await db.prepare(`SELECT * FROM project_page_actions WHERE owner_account_id=? AND project_id=? AND attachment_id=? AND page_index=? ORDER BY at DESC LIMIT 100`).bind(user.id, id, target.attachmentId, target.pageIndex).all<Action>();
            // Old comments were already attributed actions. Old private saves are never named.
            const comments = await db.prepare('SELECT id,account_id,body,created_at FROM media_comments WHERE project_id=? AND attachment_id=? AND page_index=? ORDER BY created_at DESC LIMIT 100').bind(id, target.attachmentId, target.pageIndex).all<{
                id: string;
                account_id: string;
                body: string;
                created_at: string;
            }>();
            const saves = (actions.results ?? []).filter(action => action.kind === 'save');
            const accounts = [...new Set([...saves.map(a => a.actor_account_id), ...(comments.results ?? []).map(c => c.account_id)])].filter(value => UUID.test(value));
            const profiles = accounts.length ? await supabaseRows<{
                account_id: string;
                name: string;
            }>(config, 'profiles', new URLSearchParams({ select: 'account_id,name', account_id: `in.(${accounts.join(',')})`, limit: '300' }), request.headers.get('authorization')) : [];
            const name = (account: string) => profiles.find(p => p.account_id === account)?.name || 'Member';
            const actors: ReadDetail['actors'] = [...saves.map(a => ({ id: a.id, name: name(a.actor_account_id), avatar: null, action: 'save' as const, at: a.at })), ...(comments.results ?? []).map(c => ({ id: c.id, name: name(c.account_id), avatar: null, action: 'comment' as const, at: new Date(c.created_at.includes('T') ? c.created_at : c.created_at.replace(' ', 'T') + 'Z').toISOString(), body: c.body }))].sort((a, b) => b.at.localeCompare(a.at));
            const detail: ReadDetail = { page, saved: summary.savedByPage[page], comments: summary.commentsByPage[page], reached: summary.reach[page], actors };
            return reachJson(detail);
        }
        if (url.pathname === '/api/reach/projects' && request.method === 'GET')
            return reachJson(await summaries(db, projects, Date.now(), period).then(rows => rows.sort((a, b) => b.opened - a.opened)));
        if (url.pathname === '/api/reach/notifications' && request.method === 'GET') {
            const allowed = new Map(projects.map(p => [p.id, p])), since = new Date(Date.now() - 30 * DAY).toISOString();
            const [actions, weekly, read] = await Promise.all([
                db.prepare('SELECT * FROM project_page_actions WHERE owner_account_id=? AND at>=? ORDER BY at DESC LIMIT 1000').bind(user.id, since).all<Action>(),
                db.prepare('SELECT project_id,week_key,at,opened,finished FROM project_weekly_notes WHERE owner_account_id=? AND at>=?').bind(user.id, since).all<{
                    project_id: string;
                    week_key: string;
                    at: string;
                    opened: number;
                    finished: number;
                }>(),
                db.prepare('SELECT id,revision FROM project_notification_reads WHERE owner_account_id=?').bind(user.id).all<{
                    id: string;
                    revision: string;
                }>(),
            ]);
            const visibleActions=(actions.results??[]).filter(action=>allowed.has(action.project_id));
            const groups=new Map(groupPageActions(visibleActions).map(group=>[`d1:page:${group[0].id}`,group]));
            const acknowledgements=new Map((read.results??[]).map(row=>[row.id,row.revision]));
            const notes = coalescePageActions(visibleActions);
            for (const row of weekly.results ?? []) {
                const project = allowed.get(row.project_id);
                if (project)
                    notes.push({ id: `d1:week:${row.week_key}:${row.project_id}`, body: `${row.finished} reads of ${project.title} reached the end this week.`, timestamp: row.at, isUnread: true, kind: 'system', targetPath: `/insights?project=${row.project_id}` });
            }
            return reachJson(notes.map(note => ({ ...note, isUnread: groups.has(note.id) ? (groups.get(note.id)??[]).some(action=>acknowledgements.get(`d1:action:${action.id}`)!==action.at) : acknowledgements.get(note.id)!==note.timestamp })).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100));
        }
        if (url.pathname === '/api/reach/read' && request.method === 'POST') {
            await config.assertDeletionWrite?.([user.id], projects.map(project => project.id));
            const body = await boundedReachBody(request) as {
                id?: unknown;
                revision?: unknown;
            };
            if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['id', 'revision'].includes(k)) || typeof body.id !== 'string' || !/^d1:(page:[a-f0-9-]{36}|week:\d{4}-\d{2}-\d{2}:[a-f0-9-]{36})$/.test(body.id) || typeof body.revision !== 'string' || !Number.isFinite(Date.parse(body.revision)))
                return reachJson({ error: 'Invalid acknowledgement.' }, 400);
            if(body.id.startsWith('d1:page:')) {
                const rows=await db.prepare('SELECT * FROM project_page_actions WHERE owner_account_id=? AND at>=? ORDER BY at DESC LIMIT 1000').bind(user.id,new Date(Date.now()-30*DAY).toISOString()).all<Action>();
                const group=groupPageActions((rows.results??[]).filter(action=>projects.some(p=>p.id===action.project_id))).find(g=>`d1:page:${g[0].id}`===body.id);
                // Acknowledge the displayed actions, not a mutable aggregate ID. An
                // unsave must never turn a previously read remaining save into a badge.
                if(group?.some(action=>action.at===body.revision)) {
                    const first=group[0];
                    await db.prepare(`INSERT INTO project_notification_reads(owner_account_id,id,revision,read_at)
                      SELECT owner_account_id,'d1:action:'||id,at,? FROM project_page_actions
                      WHERE owner_account_id=? AND project_id=? AND attachment_id=? AND page_index=? AND kind=? AND at>=? AND at<=?
                      ON CONFLICT(owner_account_id,id) DO UPDATE SET revision=excluded.revision,read_at=excluded.read_at`)
                      .bind(new Date().toISOString(),user.id,first.project_id,first.attachment_id,first.page_index,first.kind,first.at,body.revision).run();
                }
            } else {
                await db.prepare('INSERT INTO project_notification_reads(owner_account_id,id,revision,read_at) VALUES(?,?,?,?) ON CONFLICT(owner_account_id,id) DO UPDATE SET revision=excluded.revision,read_at=excluded.read_at').bind(user.id, body.id, body.revision, new Date().toISOString()).run();
            }
            return reachJson({ read: true });
        }
        if (url.pathname === '/api/reach/weekly' && request.method === 'POST') {
            await config.assertDeletionWrite?.([user.id], projects.map(project => project.id));
            const body = await boundedReachBody(request) as {
                week?: unknown;
            };
            if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.week))
                return reachJson({ error: 'Invalid week.' }, 400);
            const date = new Date(`${body.week}T12:00:00Z`);
            if (date.getUTCDay() !== 0 || Math.abs(Date.now() - date.getTime()) > 2 * DAY)
                return reachJson({ error: 'Invalid week.' }, 400);
            const rows = await summaries(db, projects, date.getTime());
            const at = new Date().toISOString();
            const statements = rows.filter(row => row.weekly.opened > 0).map(row => db.prepare('INSERT OR IGNORE INTO project_weekly_notes(owner_account_id,project_id,week_key,at,opened,finished) VALUES(?,?,?,?,?,?)').bind(user.id, row.projectId, body.week, at, row.weekly.opened, row.weekly.finished));
            if (statements.length)
                await db.batch(statements);
            return reachJson({ created: statements.length });
        }
        return reachJson({ error: 'Not found.' }, 404);
    }
    catch (error) {
        return error instanceof Response ? error : unavailable();
    }
}
/** A private retry revokes disclosure even if an earlier named-save response was lost. */
export async function savePagePrivately(db: ReachDatabase, bookmark: ReachStatement, account: string, target: {projectId: string; attachmentId: string; pageIndex: number}): Promise<void> {
    try {
        await db.batch([bookmark, db.prepare("DELETE FROM project_page_actions WHERE actor_account_id=? AND project_id=? AND attachment_id=? AND page_index=? AND kind='save'").bind(account, target.projectId, target.attachmentId, target.pageIndex)]);
    } catch (error) {
        // D1 batch is transactional. Keep legacy bookmarks working before approval.
        if (!/no such table.*project_page_actions/i.test(String(error))) throw error;
        await bookmark.run();
    }
}

/** Called only after existing target access checks. No auth email is used. */
/** Server-resolved metadata from the same request's successful RLS access check. */
export type PageActionProject = { id: string; profile_id: string; category_id: string; title: string; profile: { account_id: string } };

export async function preparePageAction(request: Request, db: ReachDatabase, config: Config, user: User, target: {
    projectId: string;
    attachmentId: string;
    pageIndex: number;
}, kind: 'save' | 'comment', heading: unknown, commentId?: string, verifiedProject?: PageActionProject): Promise<ReachStatement | null> {
    if (verifiedProject && verifiedProject.id !== target.projectId) throw unavailable();
    const project = verifiedProject ?? (await projectRows(config, target.projectId, request.headers.get('authorization')))[0];
    if (!project || project.profile.account_id === user.id)
        return null;
    await config.assertDeletionWrite?.([user.id, project.profile.account_id], [target.projectId]);
    const [actor] = await supabaseRows<{
        id: string;
        account_id: string;
        name: string;
    }>(config, 'profiles', new URLSearchParams({ select: 'id,account_id,name', account_id: `eq.${user.id}`, limit: '1' }), request.headers.get('authorization'));
    if (!actor || actor.account_id !== user.id || !actor.name)
        throw unavailable();
    const id = kind === 'save' ? await sessionHash(user.id, `${target.projectId}:${target.attachmentId}:${target.pageIndex}`, 'disclosed-save') : commentId ?? crypto.randomUUID();
    // UUID identifiers keep acknowledgement IDs bounded; save retries are idempotent.
    const eventId = kind === 'save' ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}` : id;
    const path = `/p/${project.profile_id}/c/${project.category_id}/${project.id}?${new URLSearchParams({ media: target.attachmentId, page: String(target.pageIndex + 1) })}`;
    return db.prepare(`INSERT OR IGNORE INTO project_page_actions(id,owner_account_id,actor_account_id,actor_profile_id,actor_name,project_id,attachment_id,page_index,kind,at,project_title,heading,target_path,comment_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(eventId, project.profile.account_id, user.id, actor.id, actor.name.slice(0, 120), project.id, target.attachmentId, target.pageIndex, kind, new Date().toISOString(), project.title, typeof heading === 'string' ? heading.replace(/\s+/g, ' ').trim().slice(0, 120) : null, path, commentId ?? null);
}

/** One owner-only D1 read composition; no private saver identities leave this endpoint. */
export async function handleStudioAttention(request: Request, db: ReachDatabase | undefined, config: Config): Promise<Response> {
 try {
  if (request.method !== 'GET') return reachJson({error:'Method not allowed.'},405);
  const {user,projects}=await ownedProjects(request,config);
  if(!db)return unavailable();
  const ids=JSON.stringify(projects.map(p=>p.id)),since=new Date(Date.now()-7*DAY).toISOString();
  const [comments,saves,counts]=await Promise.all([
   db.prepare(`SELECT c.project_id,c.attachment_id,c.page_index,c.created_at,
     NOT EXISTS(SELECT 1 FROM media_comments r WHERE r.project_id=c.project_id AND r.attachment_id=c.attachment_id AND r.page_index=c.page_index AND r.account_id=? AND julianday(r.created_at)>julianday(c.created_at)) AS unanswered
     FROM media_comments c WHERE c.project_id IN (SELECT value FROM json_each(?)) AND c.account_id<>?
     AND (julianday(c.created_at)>=julianday(?) OR NOT EXISTS(SELECT 1 FROM media_comments r WHERE r.project_id=c.project_id AND r.attachment_id=c.attachment_id AND r.page_index=c.page_index AND r.account_id=? AND julianday(r.created_at)>julianday(c.created_at))) ORDER BY c.created_at DESC`).bind(user.id,ids,user.id,since,user.id).all<{project_id:string;attachment_id:string;page_index:number;created_at:string;unanswered:number}>(),
   db.prepare("SELECT project_id,attachment_id,page_index,at FROM project_page_actions WHERE owner_account_id=? AND actor_account_id<>? AND kind='save' AND at>=? AND project_id IN (SELECT value FROM json_each(?)) ORDER BY at DESC").bind(user.id,user.id,since,ids).all<{project_id:string;attachment_id:string;page_index:number;at:string}>().catch(error=>{if(/no such table.*project_page_actions/i.test(String(error)))return {results:[]};throw error;}),
   db.prepare("SELECT count(*) AS total FROM media_engagements WHERE kind='save' AND account_id<>? AND julianday(created_at)>=julianday(?) AND project_id IN (SELECT value FROM json_each(?))").bind(user.id,since,ids).all<{total:number}>(),
  ]);
  const activity: Array<{projectId:string;attachmentId:string;pageIndex:number;page:number;kind:'reply'|'read';at:string}>=[];
  const maps=new Map(projects.map(p=>[p.id,pageMap(p)]));
  const add=(row:{project_id:string;attachment_id:string;page_index:number},kind:'reply'|'read',at:string)=>{
   const page=maps.get(row.project_id)?.find(p=>p.attachmentId===row.attachment_id&&p.pageIndex===row.page_index)?.page;
   if(page!==undefined)activity.push({projectId:row.project_id,attachmentId:row.attachment_id,pageIndex:row.page_index,page,kind,at});
  };
  for(const c of comments.results??[]){const at=new Date(c.created_at.includes('T')?c.created_at:c.created_at.replace(' ','T')+'Z').toISOString();if(c.unanswered)add(c,'reply',at);if(at>=since)add(c,'read',at);}
  for(const a of saves.results??[])add(a,'read',a.at);
  const weeklySaved=counts.results?.[0]?.total;
  if(typeof weeklySaved!=='number'||!Number.isFinite(weeklySaved)||weeklySaved<0)throw unavailable();
  return reachJson({activity,weeklySaved});
 }catch(error){return error instanceof Response?error:reachJson({error:'Studio attention could not load.'},503);}
}
