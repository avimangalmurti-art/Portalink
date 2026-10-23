/** Device-local MOBILE composer text only. Conversation access stays server-owned. */
export const MOBILE_MESSAGE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const MOBILE_MESSAGE_DRAFT_MAX_COUNT = 20;
export const MOBILE_MESSAGE_DRAFT_MAX_TEXT = 8000;
export const MOBILE_MESSAGE_DRAFT_MAX_RECORD = 64 * 1024;
const PREFIX = 'portalink.mobile-message-drafts.v1:';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type MobileMessageDraftOptions = { storage?: DraftStorage | null; now?: number };
type MigrationOptions = MobileMessageDraftOptions & { legacyStorage?: DraftStorage | null };
export type MobileMessageDraftEntry = { conversationId: string; text: string; updatedAt: number; revision: string };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const keyFor = (accountId: string | null) => accountId && ID.test(accountId) ? PREFIX + accountId : null;
function storageFor(options: MobileMessageDraftOptions): DraftStorage | null {
  if ('storage' in options) return options.storage ?? null;
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
function legacyStorageFor(options: MigrationOptions): DraftStorage | null {
  if ('legacyStorage' in options) return options.legacyStorage ?? null;
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}
function revision(): string | null {
  try { return crypto.randomUUID(); } catch { return null; }
}
function write(accountId: string, drafts: MobileMessageDraftEntry[], options: MobileMessageDraftOptions): boolean {
  const key = keyFor(accountId), storage = storageFor(options);
  if (!key || !storage) return false;
  try {
    drafts = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MOBILE_MESSAGE_DRAFT_MAX_COUNT);
    let raw = JSON.stringify({ version: 1, accountId, drafts });
    while (raw.length > MOBILE_MESSAGE_DRAFT_MAX_RECORD && drafts.length) {
      drafts.pop(); raw = JSON.stringify({ version: 1, accountId, drafts });
    }
    if (drafts.length) storage.setItem(key, raw);
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}
function read(accountId: string | null, options: MobileMessageDraftOptions): MobileMessageDraftEntry[] {
  const key = keyFor(accountId), storage = storageFor(options), now = options.now ?? Date.now();
  if (!accountId || !key || !storage || !Number.isSafeInteger(now) || now < 0) return [];
  try {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    const record: unknown = raw.length <= MOBILE_MESSAGE_DRAFT_MAX_RECORD ? JSON.parse(raw) : null;
    if (!object(record) || !keysOnly(record, ['version', 'accountId', 'drafts']) || record.version !== 1 || record.accountId !== accountId || !Array.isArray(record.drafts) || record.drafts.length > MOBILE_MESSAGE_DRAFT_MAX_COUNT) throw new Error('Invalid local drafts');
    const drafts: MobileMessageDraftEntry[] = [], seen = new Set<string>();
    for (const entry of record.drafts) {
      if (!object(entry) || !keysOnly(entry, ['conversationId', 'text', 'updatedAt', 'revision']) || typeof entry.conversationId !== 'string' || !ID.test(entry.conversationId) || seen.has(entry.conversationId) || typeof entry.text !== 'string' || !entry.text || entry.text.length > MOBILE_MESSAGE_DRAFT_MAX_TEXT || typeof entry.revision !== 'string' || !ID.test(entry.revision) || !Number.isSafeInteger(entry.updatedAt) || (entry.updatedAt as number) < 0 || (entry.updatedAt as number) > now) throw new Error('Invalid local draft');
      seen.add(entry.conversationId);
      if ((entry.updatedAt as number) >= now - MOBILE_MESSAGE_DRAFT_TTL_MS) drafts.push(entry as MobileMessageDraftEntry);
    }
    if (drafts.length !== record.drafts.length) write(accountId, drafts, options);
    return drafts;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage is an optional convenience. */ }
    return [];
  }
}
export function readMobileMessageDrafts(accountId: string | null, options: MobileMessageDraftOptions = {}): Record<string, string> {
  return Object.fromEntries(read(accountId, options).map(entry => [entry.conversationId, entry.text]));
}
export function readMobileMessageDraft(accountId: string | null, conversationId: string, options: MobileMessageDraftOptions = {}): MobileMessageDraftEntry | null {
  return read(accountId, options).find(entry => entry.conversationId === conversationId) ?? null;
}
/** Empty/oversized text retires its old copy; the live composer remains unrestricted. */
export function saveMobileMessageDraft(accountId: string | null, conversationId: string, text: string, options: MobileMessageDraftOptions = {}): boolean {
  const now = options.now ?? Date.now();
  if (!accountId || !keyFor(accountId) || !ID.test(conversationId) || typeof text !== 'string' || !Number.isSafeInteger(now) || now < 0) return false;
  const drafts = read(accountId, options).filter(entry => entry.conversationId !== conversationId);
  if (text && text.length <= MOBILE_MESSAGE_DRAFT_MAX_TEXT) {
    const token = revision();
    if (!token) return false;
    drafts.unshift({ conversationId, text, updatedAt: now, revision: token });
  }
  return write(accountId, drafts, options) && text.length <= MOBILE_MESSAGE_DRAFT_MAX_TEXT;
}
/** An old acknowledgement cannot erase a draft edited in another mounted view. */
export function clearSentMobileMessageDraft(accountId: string | null, sent: MobileMessageDraftEntry | null, options: MobileMessageDraftOptions = {}): void {
  if (!accountId || !keyFor(accountId) || !sent) return;
  const drafts = read(accountId, options);
  if (!drafts.some(entry => entry.conversationId === sent.conversationId && entry.revision === sent.revision && entry.text === sent.text)) return;
  write(accountId, drafts.filter(entry => entry.conversationId !== sent.conversationId), options);
}
export function clearMobileMessageDrafts(accountId: string, options: MobileMessageDraftOptions = {}): void {
  const key = keyFor(accountId);
  if (!key) return;
  try { storageFor(options)?.removeItem(key); } catch { /* Identity changes never depend on storage. */ }
}

/** Upgrade only the verified profile's old session key; durable text wins. */
export function migrateMobileMessageDrafts(accountId: string | null, profileId: string | null, options: MigrationOptions = {}): Record<string, string> {
  const durable = readMobileMessageDrafts(accountId, options);
  if (!accountId || !keyFor(accountId) || !profileId || !ID.test(profileId)) return durable;
  const legacy = legacyStorageFor(options), key = `portalink-message-drafts:${profileId}`;
  if (!legacy) return durable;
  const result: Record<string, string> = Object.assign(Object.create(null), durable);
  try {
    const raw = legacy.getItem(key);
    const parsed: unknown = raw && raw.length <= MOBILE_MESSAGE_DRAFT_MAX_RECORD ? JSON.parse(raw) : null;
    if (!object(parsed)) return durable;
    const remaining = { ...parsed };
    let changed = false;
    for (const [id, text] of Object.entries(parsed)) {
      if (!ID.test(id) || typeof text !== 'string' || !text || text.length > MOBILE_MESSAGE_DRAFT_MAX_TEXT) continue;
      if (Object.prototype.hasOwnProperty.call(durable, id)) { delete remaining[id]; changed = true; continue; }
      if (Object.keys(result).length >= MOBILE_MESSAGE_DRAFT_MAX_COUNT) continue;
      result[id] = text;
      const existing = read(accountId, options), token = revision(), updatedAt = options.now ?? Date.now();
      const entry = { conversationId: id, text, updatedAt, revision: token };
      // Migration never evicts a newer durable copy to make room for legacy text.
      if (token && existing.length < MOBILE_MESSAGE_DRAFT_MAX_COUNT && JSON.stringify({ version: 1, accountId, drafts: [...existing, entry] }).length <= MOBILE_MESSAGE_DRAFT_MAX_RECORD && write(accountId, [...existing, { ...entry, revision: token }], options)) {
        delete remaining[id]; changed = true;
      }
    }
    if (changed) {
      if (Object.keys(remaining).length) legacy.setItem(key, JSON.stringify(remaining));
      else legacy.removeItem(key);
    }
    return result;
  } catch { return result; }
}

/** A successful MOBILE fallback send must not resurrect an old session copy. */
export function clearLegacyMobileMessageDraft(profileId: string | null, conversationId: string, text: string, options: MigrationOptions = {}): void {
  if (!profileId || !ID.test(profileId) || !ID.test(conversationId)) return;
  const storage = legacyStorageFor(options), key = `portalink-message-drafts:${profileId}`;
  if (!storage) return;
  try {
    const raw = storage.getItem(key);
    const record: unknown = raw && raw.length <= MOBILE_MESSAGE_DRAFT_MAX_RECORD ? JSON.parse(raw) : null;
    if (!object(record) || record[conversationId] !== text) return;
    delete record[conversationId];
    if (Object.keys(record).length) storage.setItem(key, JSON.stringify(record));
    else storage.removeItem(key);
  } catch { /* Storage failure cannot change the acknowledged send. */ }
}
