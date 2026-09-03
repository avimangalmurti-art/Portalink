import { mediaResponse, readMultipartSpec } from './portalink-media-core.js';

// No application/offline cache: only short-lived viewing capabilities, exactly
// like the existing signed URLs. Actual file bytes remain in Supabase Storage.
const PREFIX = '/__portalink_media/';
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('portalink-media-reader', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function save(file) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.put(file);
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        if (entry.value.expiresAt <= Date.now()) entry.delete();
        entry.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function load(id) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PORTALINK_MEDIA_REGISTER' || !event.ports[0]) return;
  event.waitUntil((async () => {
    try {
      const file = event.data.file;
      if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin
        || !readMultipartSpec(file) || !Array.isArray(file.urls) || file.urls.length !== file.partCount
        || !/^[a-f0-9-]{36}$/.test(file.id) || typeof file.fileName !== 'string'
        || !Number.isFinite(file.expiresAt) || file.expiresAt > Date.now() + 6 * 3600_000) throw new Error('Invalid media registration.');
      for (const address of file.urls) {
        const url = new URL(address);
        if (url.origin !== 'https://nnjtsqdmvtaxtygxqkmw.supabase.co'
          || !url.pathname.startsWith('/storage/v1/object/sign/project-media/')) throw new Error('Invalid viewing URL.');
      }
      await save(file);
      event.ports[0].postMessage({ ok: true });
    } catch {
      event.ports[0].postMessage({ error: 'Large-file viewing is unavailable in this browser. Please try another browser.' });
    }
  })());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith((async () => {
    if (!['GET', 'HEAD'].includes(event.request.method)) return new Response(null, { status: 405 });
    const file = await load(url.pathname.slice(PREFIX.length).split('/')[0]);
    if (!file || file.expiresAt <= Date.now()) return new Response('Refresh the project to renew this file link.', { status: 410 });
    return mediaResponse(event.request, file);
  })().catch(() => new Response('This file could not be loaded. Refresh the project and try again.', { status: 502 })));
});
