import type { DraftMetadata, PersistedAttachment, PersistedMedia, PreparedMedia, ProjectDraft, PublishResult } from '../../types/publishing';
export type FirstProjectStage = 'files' | 'details' | 'review';
export type FirstProjectDraft = {
  version: 1; accountId: string; profileId: string; draft: ProjectDraft;
  metadata: DraftMetadata; location: string; stage: FirstProjectStage;
  media: PreparedMedia[]; persisted: PersistedMedia[]; attachments: PersistedAttachment[];
  committed?: PublishResult;
};
type Stored = Omit<FirstProjectDraft, 'media'> & { key: string; media: Array<Omit<PreparedMedia, 'file' | 'previewUrl'> & { lastModified: number }> };
const queues = new Map<string, Promise<unknown>>();
const keyFor = (accountId: string, profileId: string) => `${accountId}:${profileId}`;
function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}
async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction, done: (value: T) => void) => void): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local draft storage is unavailable. Keep this screen open.')); return; }
    const request = indexedDB.open('portalink-first-project', 1);
    let blocked = false;
    request.onupgradeneeded = () => { request.result.createObjectStore('drafts'); request.result.createObjectStore('files'); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other upload tabs and try again.')); };
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['drafts', 'files'], mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Your local draft could not be saved. Keep this screen open and try again.'));
      try { run(tx, result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
export function saveFirstProjectDraft(input: FirstProjectDraft): Promise<void> {
  const key = keyFor(input.accountId, input.profileId);
  return serial(key, () => transaction<void>('readwrite', tx => {
    const drafts = tx.objectStore('drafts'), files = tx.objectStore('files');
    const get = drafts.get(key);
    get.onsuccess = () => {
      const previous = get.result as Stored | undefined;
      const oldIds = new Set(previous?.media.map(item => item.id));
      const ids = new Set(input.media.map(item => item.id));
      for (const id of oldIds) if (!ids.has(id)) files.delete(`${key}:${id}`);
      for (const item of input.media) if (!oldIds.has(item.id)) files.put(item.file, `${key}:${item.id}`);
      drafts.put({ ...input, key, media: input.media.map(({ file, previewUrl: _url, ...item }) => { void _url; return { ...item, lastModified: file.lastModified }; }) } satisfies Stored, key);
    };
  }));
}
export function readFirstProjectDraft(accountId: string, profileId: string): Promise<FirstProjectDraft | null> {
  const key = keyFor(accountId, profileId);
  return serial(key, () => transaction<FirstProjectDraft | null>('readonly', (tx, done) => {
    const request = tx.objectStore('drafts').get(key);
    request.onsuccess = () => {
      const row = request.result as Stored | undefined;
      if (!row || row.version !== 1 || row.accountId !== accountId || row.profileId !== profileId || row.draft.profileId !== profileId) { done(null); return; }
      const media: PreparedMedia[] = [];
      if (!row.media.length) { done({ ...row, media }); return; }
      let pending = row.media.length;
      for (const item of row.media) {
        const fileRequest = tx.objectStore('files').get(`${key}:${item.id}`);
        fileRequest.onsuccess = () => {
          const blob = fileRequest.result as Blob | undefined;
          if (!(blob instanceof Blob)) { tx.abort(); return; }
          const file = blob instanceof File ? blob : new File([blob], item.fileName, { type: item.mimeType, lastModified: item.lastModified });
          media.push({ ...item, file, previewUrl: null });
          pending -= 1;
          if (!pending) done({ ...row, media: media.sort((a, b) => a.order - b.order) });
        };
      }
    };
  }));
}
export function clearFirstProjectDraft(accountId: string, profileId: string): Promise<void> {
  const key = keyFor(accountId, profileId);
  return serial(key, () => transaction<void>('readwrite', tx => {
    const drafts = tx.objectStore('drafts');
    const get = drafts.get(key);
    get.onsuccess = () => {
      const previous = get.result as Stored | undefined;
      for (const item of previous?.media ?? []) tx.objectStore('files').delete(`${key}:${item.id}`);
      drafts.delete(key);
    };
  }));
}
