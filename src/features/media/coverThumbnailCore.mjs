/** Shared by browser publishing and the explicit Node backfill. No DOM or network access here. */
export const COVER_THUMBNAIL_SIZES = Object.freeze([200, 400, 800]);
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function coverThumbnailGeometry(width, height, input = {}) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('The cover has no readable dimensions.');
  const frame = input.frame;
  const candidateRatio = frame?.aspectRatio ?? input.aspectRatio;
  const ratio = clamp(finite(candidateRatio, width / height), 1 / 4096, 4096);
  const zoom = clamp(finite(frame?.zoom, 1), 1, 3);
  const saved = frame?.crop;
  const validCrop = saved && [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)
    && saved.x >= 0 && saved.y >= 0 && saved.width > 0 && saved.height > 0
    && saved.x + saved.width <= 1.0000001 && saved.y + saved.height <= 1.0000001;
  // An unframed document retains its entire page, including when the card uses
  // the legacy paper ratio. A creator-selected crop is always authoritative.
  const contain = input.kind === 'document' && !frame;
  const cropWidth = Math.min(1, ratio / (width / height)) / zoom;
  const cropHeight = Math.min(1, (width / height) / ratio) / zoom;
  const crop = validCrop ? saved : contain ? { x: 0, y: 0, width: 1, height: 1 } : {
    x: (1 - cropWidth) * clamp(finite(frame?.x, 0.5), 0, 1),
    y: (1 - cropHeight) * clamp(finite(frame?.y, 0.5), 0, 1),
    width: cropWidth, height: cropHeight,
  };
  return { ratio, contain, source: { x: crop.x * width, y: crop.y * height, width: crop.width * width, height: crop.height * height } };
}

/** Runtime methods are adapters only; source selection, cropping and sizes stay identical. */
export async function renderCoverVariants(input, runtime) {
  if (!input.sourceUrl) throw new Error('Choose a cover before preparing its thumbnail.');
  const zoom = clamp(finite(input.frame?.zoom, 1), 1, 3);
  let decoded;
  if (input.kind === 'document') decoded = await runtime.renderPdfPage(input.sourceUrl, Math.max(1, Math.floor(finite(input.pageNumber, 1))), Math.ceil(800 * zoom));
  else if (input.kind === 'image') decoded = await runtime.loadImage(input.sourceUrl);
  else if (input.kind === 'video') decoded = input.posterUrl
    ? await runtime.loadImage(input.posterUrl) : await runtime.loadVideoFrame(input.sourceUrl);
  else throw new Error('Choose an image, PDF page, or video frame for this project cover.');
  try {
    const geometry = coverThumbnailGeometry(decoded.width, decoded.height, input);
    const variants = [];
    for (const size of COVER_THUMBNAIL_SIZES) {
      const width = Math.max(1, Math.round(size * Math.min(1, geometry.ratio)));
      const height = Math.max(1, Math.round(size / Math.max(1, geometry.ratio)));
      const canvas = runtime.createCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The cover canvas could not be prepared.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      if (input.kind === 'document') { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
      const source = geometry.source;
      const scale = geometry.contain ? Math.min(width / source.width, height / source.height) : null;
      const drawWidth = scale === null ? width : source.width * scale;
      const drawHeight = scale === null ? height : source.height * scale;
      context.drawImage(decoded.source, source.x, source.y, source.width, source.height,
        (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      variants.push({ size, width, height, blob: await runtime.encodeWebp(canvas) });
    }
    return variants;
  } finally { await decoded.dispose?.(); }
}
