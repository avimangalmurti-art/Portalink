import type { Upload } from 'tus-js-client';
import type { PreparedMedia } from '../../types/publishing';

type UrlStorage = NonNullable<ConstructorParameters<typeof Upload>[1]['urlStorage']>;
type PreviousUpload = Awaited<ReturnType<UrlStorage['findAllUploads']>>[number];
type Checkpoint = { key: string; accountId: string; objectPath: string; fingerprint: string; uploadUrl: string; size: number; createdAt: number };
const TTL = 23 * 60 * 60 * 1000;
const MAX_RECORDS = 256;
const HASH_CHUNK = 6 * 1024 * 1024;
const memory = new Map<string, Checkpoint>();
const ids = /^[A-Za-z0-9_-]{1,128}$/;

/** Hash every byte with bounded memory. A replaced file cannot inherit an old upload. */
export async function mobileUploadObjectId(accountId: string, profileId: string, draftId: string, item: PreparedMedia, stopped: () => boolean): Promise<string | null> {
  if (![accountId, profileId, draftId, item.id].every(id => ids.test(id)) || item.file.size !== item.sizeBytes) throw new Error('This upload does not match its saved draft.');
  const digest = async (bytes: BufferSource) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let hash = await digest(new TextEncoder().encode(JSON.stringify([accountId, profileId, draftId, item.id, item.fileName, item.mimeType, item.sizeBytes, item.file.lastModified])));
  for (let offset = 0; offset < item.file.size; offset += HASH_CHUNK) {
    if (stopped()) return null;
    const part = await digest(await item.file.slice(offset, offset + HASH_CHUNK).arrayBuffer());
    if (stopped()) return null;
    const combined = new Uint8Array(64); combined.set(hash); combined.set(part, 32);
    hash = await digest(combined);
  }
  if (stopped()) return null;
  const hex = [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validUrl(value: unknown, endpoint: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value), base = new URL(endpoint);
    return url.protocol === 'https:' && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(`${base.pathname}/`) && url.pathname.length > base.pathname.length + 1;
  } catch { return false; }
}

async function records<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void, create = true): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Recovery storage unavailable')); return; }
    const request = indexedDB.open('portalink-mobile-upload-recovery', 1);
    let blocked = false;
    request.onupgradeneeded = () => { if (create) request.result.createObjectStore('uploads', { keyPath: 'key' }); else request.transaction?.abort(); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = request.onblocked = () => { blocked = true; reject(new Error('Recovery storage unavailable')); };
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('uploads', mode); let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(new Error('Recovery storage unavailable'));
      try { run(tx.objectStore('uploads'), next => { value = next; }); } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}

function recent(row: Checkpoint, now: number) {
  return Number.isFinite(row?.createdAt) && row.createdAt <= now && now - row.createdAt < TTL;
}

/** TUS upload handles stay in account-scoped IndexedDB, never auth headers or viewing URLs. */
export function mobileUploadUrlStorage(accountId: string, objectPath: string, endpoint: string, size: number, metadata: Record<string, string>): UrlStorage {
  const key = `${accountId}:${objectPath}`;
  const read = async () => {
    try {
      const saved = await records<Checkpoint[]>('readonly', (store, done) => { const request = store.getAll(); request.onsuccess = () => done(request.result); });
      return [...new Map([...saved, ...memory.values()].map(row => [row?.key, row])).values()];
    }
    catch { return [...memory.values()]; }
  };
  const find = async (fingerprint?: string): Promise<PreviousUpload[]> => (await read()).filter(row => row?.key === key && row.accountId === accountId && row.objectPath === objectPath
    && row.size === size && recent(row, Date.now()) && validUrl(row.uploadUrl, endpoint) && (!fingerprint || row.fingerprint === fingerprint))
    .map(row => ({ size, metadata, creationTime: new Date(row.createdAt).toISOString(), urlStorageKey: key, uploadUrl: row.uploadUrl, parallelUploadUrls: null }));
  return {
    findAllUploads: () => find(),
    findUploadsByFingerprint: find,
    async removeUpload(storageKey) {
      if (storageKey !== key) return;
      memory.delete(key);
      try { await records<void>('readwrite', (store, done) => { store.delete(key); done(); }); } catch { /* Recovery is optional; the durable draft still owns this file. */ }
    },
    async addUpload(fingerprint, upload) {
      if (typeof fingerprint !== 'string' || fingerprint.length > 2048 || upload.size !== size || !validUrl(upload.uploadUrl, endpoint)) throw new Error('The upload returned an invalid recovery address.');
      const row: Checkpoint = { key, accountId, objectPath, fingerprint, uploadUrl: upload.uploadUrl, size, createdAt: Date.now() };
      memory.set(key, row);
      for (const [oldKey, old] of memory) if (!recent(old, Date.now())) memory.delete(oldKey);
      while (memory.size > MAX_RECORDS) {
        const oldest = memory.keys().next().value;
        if (oldest === undefined) break;
        memory.delete(oldest);
      }
      try {
        await records<void>('readwrite', (store, done) => {
          const request = store.getAll();
          request.onsuccess = () => {
            const all = request.result as Checkpoint[];
            for (const old of all) if (!recent(old, Date.now()) && typeof old?.key === 'string') store.delete(old.key);
            const own = all.filter(old => old?.accountId === accountId && old.key !== key);
            const retained = own.filter(old => recent(old, Date.now())).sort((a, b) => b.createdAt - a.createdAt);
            for (const old of retained.slice(MAX_RECORDS - 1)) store.delete(old.key);
            store.put(row); done();
          };
        });
      } catch { /* Memory fallback preserves retries while this page remains open. */ }
      return key;
    },
  };
}

/** Clear handles only after explicit object cleanup succeeds; failed cleanup remains retryable. */
export async function clearMobileUploadHandles(objectPath: string): Promise<void> {
  const matches = (row: Checkpoint) => typeof row?.objectPath === 'string' && (row.objectPath === objectPath || row.objectPath.startsWith(`${objectPath}.parts/`));
  for (const [key, row] of memory) if (matches(row)) memory.delete(key);
  try {
    await records<void>('readwrite', (store, done) => {
      const request = store.getAll(); request.onsuccess = () => { for (const row of request.result as Checkpoint[]) if (matches(row)) store.delete(row.key); done(); };
    }, false);
  } catch { /* A stale handle cannot restore deleted bytes; TUS checks its offset with the server. */ }
}
