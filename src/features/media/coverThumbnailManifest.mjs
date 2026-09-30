const encoder = new TextEncoder();
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

/** Canonical field order and defaults keep browser publication and backfill identical. */
export async function thumbnailSourceKey({ id, storagePath, pageNumber, frame }) {
  let normalized = null;
  if (frame && typeof frame === 'object') {
    normalized = {
      x: clamp(finite(frame.x, 0.5), 0, 1), y: clamp(finite(frame.y, 0.5), 0, 1),
      zoom: clamp(finite(frame.zoom, 1), 1, 3),
    };
    if (Number.isFinite(frame.aspectRatio) && frame.aspectRatio >= 1 / 4096 && frame.aspectRatio <= 4096) normalized.aspectRatio = frame.aspectRatio;
    const crop = frame.crop;
    if (crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)
      && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0
      && crop.x + crop.width <= 1.0000001 && crop.y + crop.height <= 1.0000001) {
      normalized.crop = { x: crop.x, y: crop.y, width: crop.width, height: crop.height, zoom: normalized.zoom };
    }
  }
  return sha256(encoder.encode(JSON.stringify({
    version: 1, id: String(id), storagePath: String(storagePath),
    pageNumber: Math.max(1, Math.floor(finite(pageNumber, 1))), frame: normalized,
  })));
}

/** Hash the actual encoded output, including its dimensions, in size order. */
export async function thumbnailContentHash(variants) {
  const ordered = [...variants].sort((left, right) => left.size - right.size);
  if (ordered.length !== 3 || ordered.some((variant, index) => variant.size !== [200, 400, 800][index])) throw new Error('Three cover thumbnail variants are required.');
  const parts = [encoder.encode('portalink-cover-v1\n')];
  for (const variant of ordered) {
    const bytes = variant.blob instanceof Uint8Array ? variant.blob : new Uint8Array(await variant.blob.arrayBuffer());
    parts.push(encoder.encode(`${variant.size}:${variant.width}:${variant.height}:${bytes.byteLength}\n`), bytes);
  }
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return sha256(bytes);
}
