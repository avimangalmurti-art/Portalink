import { requireSupabase } from './client';
import { cachedMediaSource, signedMediaUrls } from './mediaUrlCache';
import { MANIFEST_SUFFIX, mediaResponse, multipartSpec, partPath, readMultipartSpec } from '../../../public/portalink-media-core.js';
import type { MultipartSpec } from '../../../public/portalink-media-core.js';
import type { PdfRangeSource } from '../../types/domain';

export { MANIFEST_SUFFIX, multipartSpec, partPath, readMultipartSpec };
export type { MultipartSpec };
const BUCKET = 'project-media';
let readerReady: Promise<void> | undefined;

export function ensureMultipartReader(): Promise<void> {
  if (!readerReady) readerReady = (async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      throw new Error('Please use a current browser over HTTPS to upload or view large files.');
    }
    await navigator.serviceWorker.register('/portalink-media-reader.js', { type: 'module', scope: '/', updateViaCache: 'none' });
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (!navigator.serviceWorker.controller?.scriptURL.endsWith('/portalink-media-reader.js')) return;
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      const timeout = setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        reject(new Error('Large-file viewing could not start. Refresh the page and try again.'));
      }, 15_000);
      navigator.serviceWorker.addEventListener('controllerchange', finish);
      finish();
    });
  })().catch((error) => { readerReady = undefined; throw error; });
  return readerReady;
}

export async function multipartSource(path: string, spec: MultipartSpec, fileName: string, mimeType: string): Promise<string> {
  return cachedMediaSource(JSON.stringify([path, spec, fileName, mimeType]), () => createMultipartSource(path, spec, fileName, mimeType), 5 * 3600_000);
}

async function signMultipartParts(path: string, spec: MultipartSpec): Promise<string[]> {
  const paths = Array.from({ length: spec.partCount }, (_, index) => partPath(path, index));
  const signed = await signedMediaUrls(BUCKET, paths, 5 * 3600_000);
  return paths.map(item => {
    const address = signed.get(item);
    if (!address) throw new Error('Some parts of this file are unavailable. Refresh the project and try again.');
    return address;
  });
}

/** Read the same signed parts when an embedded browser cannot serve a virtual URL. */
export function multipartPdfRangeReader(path: string, spec: MultipartSpec, fileName: string): () => Promise<PdfRangeSource> {
  return async () => {
    const urls = await signMultipartParts(path, spec);
    return {
      length: spec.sizeBytes,
      async read(begin, end, signal) {
        signal.throwIfAborted();
        if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > spec.sizeBytes) {
          throw new Error('The PDF requested an invalid byte range.');
        }
        const request = new Request(urls[0], {
          headers: { Range: `bytes=${begin}-${end - 1}` },
          signal,
        });
        const response = await mediaResponse(request, { ...spec, urls, fileName, mimeType: 'application/pdf' });
        if (response.status !== 206) throw new Error('This part of the PDF could not be loaded.');
        const data = new Uint8Array(await response.arrayBuffer());
        signal.throwIfAborted();
        if (data.byteLength !== end - begin) throw new Error('The PDF returned an incomplete byte range.');
        return data;
      },
    };
  };
}

async function createMultipartSource(path: string, spec: MultipartSpec, fileName: string, mimeType: string): Promise<string> {
  // Sign the parts while the service worker becomes ready.
  const [, urls] = await Promise.all([ensureMultipartReader(), signMultipartParts(path, spec)]);
  const id = crypto.randomUUID();
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); reject(new Error('Large-file viewing could not be prepared.')); }, 15_000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data.ok) resolve(); else reject(new Error(event.data.error));
    };
    const controller = navigator.serviceWorker.controller;
    if (!controller) { clearTimeout(timeout); channel.port1.close(); reject(new Error('Refresh the page to load this file.')); return; }
    controller.postMessage({
      type: 'PORTALINK_MEDIA_REGISTER',
      file: { ...spec, id, urls, fileName, mimeType, expiresAt: Date.now() + 5 * 3600_000 },
    }, [channel.port2]);
  });
  return `${location.origin}/__portalink_media/${id}/${encodeURIComponent(fileName)}`;
}

/** Delete parts first, then their manifest. Failed cleanup keeps a discoverable
 * manifest for retry, including when a partially completed upload is cancelled. */
export async function removeStoredMedia(paths: string[]): Promise<void> {
  const bucket = requireSupabase().storage.from(BUCKET);
  for (const path of [...new Set(paths)]) {
    if (path.endsWith(MANIFEST_SUFFIX)) {
      const directory = `${path}.parts`;
      let hasParts = true;
      while (hasParts) {
        const { data, error } = await bucket.list(directory, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        if (!data?.length) { hasParts = false; continue; }
        const removal = await bucket.remove(data.map((item) => `${directory}/${item.name}`));
        if (removal.error) throw removal.error;
      }
    }
    const { error } = await bucket.remove([path]);
    if (error) throw error;
  }
}
