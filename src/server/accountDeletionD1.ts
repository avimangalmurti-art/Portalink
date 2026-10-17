/** Internal deletion transport only. Never authenticate this route with a Supabase key. */
export const ACCOUNT_DELETION_D1_PATH = '/api/internal/account-deletion/d1';
export const ACCOUNT_DELETION_D1_PURPOSE = 'portalink-account-deletion-d1:v1';
const MAX_BYTES = 64 * 1024;
const MAX_PROJECTS = 1000;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const HEX_KEY = /^[a-f0-9]{64}$/;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

type Statement = { bind(...values: unknown[]): Statement; first<T = unknown>(): Promise<T | null> };
type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };
export type AccountDeletionD1Environment = {
  DB?: Database;
  ACCOUNT_DELETION_D1_ENABLED?: string;
  ACCOUNT_DELETION_D1_FENCE_ENABLED?: string;
  /** Independent random 32-byte credential encoded as 64 lowercase hex characters. */
  ACCOUNT_DELETION_D1_HMAC_SECRET?: string;
};
export type AccountDeletionD1Manifest = { version: 1; jobId: string; accountId: string; ownedProjectIds: string[] };
type Envelope = AccountDeletionD1Manifest & { issuedAt: number; expiresAt: number };
const json = (value: unknown, status: number) => new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
const unavailable = () => json({ error: 'Account deletion cleanup is unavailable.' }, 503);
const encode = (value: string) => new TextEncoder().encode(value);
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const FENCE_TRIGGERS = ['engagement', 'comment', 'action', 'notification', 'weekly', 'reach', 'rollup']
  .flatMap(name => ['insert', 'update'].map(operation => `deletion_fence_${name}_${operation}`))
  .concat(['deletion_fence_receipt_update', 'deletion_fence_receipt_delete']);

/** Optional application preflight; durable SQLite triggers close the write race. */
export async function assertAccountDeletionD1WriteAllowed(db: Database, accounts: string[], projects: string[]): Promise<void> {
  try {
    const result = await db.prepare(`SELECT
      (SELECT count(*) FROM sqlite_master WHERE type='trigger' AND name IN (SELECT value FROM json_each(?))) AS trigger_count,
      (SELECT count(*) FROM sqlite_master WHERE type='index' AND name='account_deletion_d1_one_account_per_job') AS job_index,
      EXISTS(SELECT 1 FROM account_deletion_d1_fences
      WHERE (scope_kind='account' AND scope_id IN (SELECT value FROM json_each(?)))
      OR (scope_kind='project' AND scope_id IN (SELECT value FROM json_each(?)))) AS blocked`)
      .bind(JSON.stringify(FENCE_TRIGGERS), JSON.stringify(accounts), JSON.stringify(projects)).first<{ trigger_count: number; job_index: number; blocked: number }>();
    if (!result || result.trigger_count !== FENCE_TRIGGERS.length || result.job_index !== 1 || ![0, 1].includes(result.blocked)) throw unavailable();
    if (result.blocked) throw json({ error: 'Account deletion write blocked.' }, 403);
  } catch (error) { throw error instanceof Response ? error : unavailable(); }
}

/** Timestamps are transport credentials; the durable job checkpoint binds only immutable scope. */
export async function accountDeletionD1ManifestDigest(manifest: AccountDeletionD1Manifest): Promise<string> {
  const canonical = JSON.stringify({ version: 1, jobId: manifest.jobId, accountId: manifest.accountId, ownedProjectIds: [...manifest.ownedProjectIds].sort() });
  return hex(await crypto.subtle.digest('SHA-256', encode(canonical)));
}

async function boundedBody(request: Request): Promise<string> {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw json({ error: 'Invalid payload size.' }, 413);
  if (!request.body) throw json({ error: 'Invalid cleanup payload.' }, 400);
  const reader = request.body.getReader(), bytes = new Uint8Array(MAX_BYTES);
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.byteLength > MAX_BYTES) {
        await reader.cancel();
        throw json({ error: 'Payload too large.' }, 413);
      }
      bytes.set(chunk.value, size);
      size += chunk.value.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
  } catch (error) {
    throw error instanceof Response ? error : json({ error: 'Invalid cleanup payload.' }, 400);
  } finally { reader.releaseLock(); }
}

function envelope(value: unknown, now: number): Envelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const keys = ['version', 'jobId', 'accountId', 'ownedProjectIds', 'issuedAt', 'expiresAt'];
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key)) || row.version !== 1) return null;
  if (typeof row.jobId !== 'string' || !UUID.test(row.jobId) || typeof row.accountId !== 'string' || !UUID.test(row.accountId)) return null;
  if (!Array.isArray(row.ownedProjectIds) || row.ownedProjectIds.length > MAX_PROJECTS
    || row.ownedProjectIds.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(row.ownedProjectIds).size !== row.ownedProjectIds.length) return null;
  const issuedAt = row.issuedAt, expiresAt = row.expiresAt;
  if (typeof issuedAt !== 'number' || typeof expiresAt !== 'number' || !Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)
    || expiresAt <= issuedAt || expiresAt - issuedAt > 300 || issuedAt > now + 30 || issuedAt < now - 300 || expiresAt <= now) return null;
  return row as Envelope;
}

/**
 * The signer must read account/project IDs from the locked, immutable deletion job,
 * never from a browser or from title/prefix matching. D1 cannot re-establish project
 * ownership after upstream anonymization. A valid signature delegates exactly that
 * manifest. Completion MUST be checkpointed durably upstream before deleting Auth.
 *
 * Same-scope signed retries within their short validity window are intentionally
 * idempotent. There is no claim of a cross-instance one-use nonce store. Expired or
 * modified envelopes fail closed. The separately approved fence schema prevents
 * in-flight or still-authorized writes from resurrecting the cleaned identities.
 */
export async function handleAccountDeletionD1(request: Request, environment: AccountDeletionD1Environment, options: { now?: () => number } = {}): Promise<Response> {
  const secret = environment.ACCOUNT_DELETION_D1_HMAC_SECRET;
  if (environment.ACCOUNT_DELETION_D1_ENABLED !== 'true' || environment.ACCOUNT_DELETION_D1_FENCE_ENABLED !== 'true' || !secret || !HEX_KEY.test(secret) || !environment.DB) return unavailable();
  const url = new URL(request.url);
  if (url.pathname !== ACCOUNT_DELETION_D1_PATH) return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...JSON_HEADERS, allow: 'POST' } });
  if (request.headers.has('origin')) return json({ error: 'Browser requests are not allowed.' }, 403);
  if (url.search || !/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')
    || !['', 'identity'].includes(request.headers.get('content-encoding') ?? '')) return json({ error: 'Invalid cleanup request.' }, 400);
  const signature = request.headers.get('x-portalink-deletion-signature');
  if (!signature || !HEX_KEY.test(signature)) return json({ error: 'Cleanup authentication failed.' }, 401);
  try {
    const raw = await boundedBody(request);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return json({ error: 'Invalid cleanup payload.' }, 400); }
    const manifest = envelope(parsed, Math.floor((options.now ?? Date.now)() / 1000));
    if (!manifest) return json({ error: 'Invalid or expired cleanup manifest.' }, 400);
    // The text of the independent hex credential is the HMAC key on both transports.
    const key = await crypto.subtle.importKey('raw', encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = new Uint8Array((signature.match(/../g) ?? []).map(pair => parseInt(pair, 16)));
    const verified = await crypto.subtle.verify('HMAC', key, signatureBytes, encode(`${ACCOUNT_DELETION_D1_PURPOSE}\nPOST\n${ACCOUNT_DELETION_D1_PATH}\n${raw}`));
    if (!verified) return json({ error: 'Cleanup authentication failed.' }, 401);
    const digest = await accountDeletionD1ManifestDigest(manifest);
    const projects = JSON.stringify([...manifest.ownedProjectIds].sort()), account = manifest.accountId;
    const db = environment.DB;
    // A partial table-only installation must never produce a cleanup receipt.
    // Empty scope verifies the schema without rejecting a legitimate fenced retry.
    await assertAccountDeletionD1WriteAllowed(db, [], []);
    const blockedAt = new Date((options.now ?? Date.now)()).toISOString();
    const statements = [
      // A conflicting account/job/project scope aborts the entire batch. The
      // NOT NULL constraint plus immutable-receipt trigger prevents replacement.
      db.prepare(`INSERT INTO account_deletion_d1_fences(scope_kind,scope_id,job_id,manifest_digest,blocked_at)
        VALUES('account',?,?,?,?) ON CONFLICT(scope_kind,scope_id) DO UPDATE SET manifest_digest=
        CASE WHEN job_id=excluded.job_id AND manifest_digest=excluded.manifest_digest THEN manifest_digest ELSE NULL END`)
        .bind(account, manifest.jobId, digest, blockedAt),
      db.prepare(`INSERT INTO account_deletion_d1_fences(scope_kind,scope_id,job_id,manifest_digest,blocked_at)
        SELECT 'project',value,?,?,? FROM json_each(?) WHERE true
        ON CONFLICT(scope_kind,scope_id) DO UPDATE SET manifest_digest=
        CASE WHEN job_id=excluded.job_id AND manifest_digest=excluded.manifest_digest THEN manifest_digest ELSE NULL END`)
        .bind(manifest.jobId, digest, blockedAt, projects),
      db.prepare('DELETE FROM media_engagements WHERE account_id = ? OR project_id IN (SELECT value FROM json_each(?))').bind(account, projects),
      db.prepare('DELETE FROM project_page_actions WHERE actor_account_id = ? OR project_id IN (SELECT value FROM json_each(?))').bind(account, projects),
      // A historical owner field is not proof that an unlisted project is owned.
      // Remove the departing identity without erasing another actor's action.
      db.prepare("UPDATE project_page_actions SET owner_account_id = 'deleted-account' WHERE owner_account_id = ?").bind(account),
      db.prepare('DELETE FROM media_comments WHERE project_id IN (SELECT value FROM json_each(?))').bind(projects),
      // Keep stable comment IDs and other authors on surviving projects. The current
      // schema is flat; no child rows or shared conversations are cascaded away.
      db.prepare("UPDATE media_comments SET account_id = 'deleted-account', author_name = 'Deleted account', author_avatar_url = NULL, body = '[deleted]' WHERE account_id = ?").bind(account),
      db.prepare('DELETE FROM project_notification_reads WHERE owner_account_id = ?').bind(account),
      db.prepare('DELETE FROM project_weekly_notes WHERE owner_account_id = ? OR project_id IN (SELECT value FROM json_each(?))').bind(account, projects),
      // Reach hashes on surviving projects are anonymous tab/project/day signals,
      // not account identifiers. Retain them and their anonymous daily aggregates.
      db.prepare('DELETE FROM project_reach_events WHERE project_id IN (SELECT value FROM json_each(?))').bind(projects),
      db.prepare('DELETE FROM project_reach_daily WHERE project_id IN (SELECT value FROM json_each(?))').bind(projects),
    ];
    const results = await db.batch(statements);
    if (!Array.isArray(results) || results.length !== statements.length || results.some(result => !result || result.success !== true)) return unavailable();
    return json({ completed: true, jobId: manifest.jobId, manifestDigest: digest }, 200);
  } catch (error) {
    if (error instanceof Response) return error;
    return unavailable();
  }
}
