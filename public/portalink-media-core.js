// Shared by the streaming reader and its non-browser regression tests.
export const PART_BYTES = 40 * 1024 * 1024;
export const MANIFEST_SUFFIX = '.portalink-multipart.json';

export function partPath(manifestPath, index) {
  return `${manifestPath}.parts/${String(index).padStart(6, '0')}`;
}

export function multipartSpec(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error('Invalid file size.');
  return { version: 1, sizeBytes, partBytes: PART_BYTES, partCount: Math.ceil(sizeBytes / PART_BYTES) };
}

export function readMultipartSpec(value) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes <= 0
    || value.partBytes !== PART_BYTES || value.partCount !== Math.ceil(value.sizeBytes / PART_BYTES)) return undefined;
  return multipartSpec(value.sizeBytes);
}

export function byteRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  const start = first === null ? Math.max(0, size - last) : first;
  const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
  if (start >= size || start > end || (first === null && last === 0)) return null;
  return { start, end, partial: true };
}

export async function mediaResponse(request, file, fetchPart = fetch) {
  const spec = readMultipartSpec(file);
  if (!spec || file.urls.length !== spec.partCount) return new Response('Incomplete file.', { status: 502 });
  const range = byteRange(request.headers.get('range'), spec.sizeBytes);
  if (!range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${spec.sizeBytes}` } });
  const headers = new Headers({
    'accept-ranges': 'bytes',
    'content-type': file.mimeType || 'application/octet-stream',
    'content-length': String(range.end - range.start + 1),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    'content-disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
  });
  if (range.partial) headers.set('content-range', `bytes ${range.start}-${range.end}/${spec.sizeBytes}`);
  if (request.method === 'HEAD') return new Response(null, { status: range.partial ? 206 : 200, headers });

  const abort = new AbortController();
  let reader;
  let position = range.start;
  let skip = 0;
  let partRemaining = 0;
  let cancelled = false;
  request.signal.addEventListener('abort', () => { abort.abort(); void reader?.cancel().catch(() => undefined); }, { once: true });
  async function openPart() {
    const index = Math.floor(position / spec.partBytes);
    const start = position % spec.partBytes;
    const end = Math.min(spec.partBytes - 1, range.end - index * spec.partBytes);
    const response = await fetchPart(file.urls[index], {
      headers: { Range: `bytes=${start}-${end}` }, signal: abort.signal,
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
    });
    if (!response.ok || !response.body) throw new Error('This file could not be loaded. Refresh the project and try again.');
    if (response.status === 206) {
      const actualSize = Math.min(spec.partBytes, spec.sizeBytes - index * spec.partBytes);
      // Supabase returns Content-Range, but does not expose it through CORS.
      // Validate it when visible and always check the safelisted length when
      // provided. The streaming reader also detects premature end-of-body.
      const actualRange = response.headers.get('content-range');
      const actualLength = response.headers.get('content-length');
      if ((actualRange && actualRange !== `bytes ${start}-${end}/${actualSize}`)
        || (actualLength !== null && Number(actualLength) !== end - start + 1)) {
        await response.body.cancel();
        throw new Error('The file returned an incorrect byte range.');
      }
      skip = 0;
    } else if (response.status === 200) {
      // Some Storage gateways ignore Range. Skip their prefix while streaming,
      // and cancel at the requested end; never buffer the complete large file.
      skip = start;
    } else throw new Error('Unexpected file response.');
    partRemaining = end - start + 1;
    reader = response.body.getReader();
  }
  try { await openPart(); } catch { return new Response('File unavailable. Refresh the project and try again.', { status: 502 }); }
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (position > range.end) { controller.close(); return; }
          if (!reader) await openPart();
          const { value, done } = await reader.read();
          if (cancelled) return;
          if (done) throw new Error('The stored file part is incomplete.');
          if (skip >= value.byteLength) { skip -= value.byteLength; continue; }
          const bytes = value.subarray(skip, Math.min(value.byteLength, skip + partRemaining));
          skip = 0;
          partRemaining -= bytes.byteLength;
          position += bytes.byteLength;
          controller.enqueue(bytes);
          if (partRemaining === 0) { await reader.cancel(); reader = undefined; }
          return;
        }
      } catch (error) {
        abort.abort();
        await reader?.cancel().catch(() => undefined);
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() { cancelled = true; abort.abort(); await reader?.cancel().catch(() => undefined); },
  });
  return new Response(stream, { status: range.partial ? 206 : 200, headers });
}
