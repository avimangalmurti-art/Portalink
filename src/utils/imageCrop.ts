import type { ImagePosition, ImageSize, RelativeImageCrop } from '../types/imageCrop';

export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 3;
export const CENTER_IMAGE_POSITION: ImagePosition = { x: 0.5, y: 0.5, zoom: 1 };
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const finite = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;

export function normalizeImagePosition(value?: Partial<ImagePosition> | null): ImagePosition {
  return {
    x: clamp(finite(value?.x, 0.5), 0, 1),
    y: clamp(finite(value?.y, 0.5), 0, 1),
    zoom: clamp(finite(value?.zoom, 1), MIN_IMAGE_ZOOM, MAX_IMAGE_ZOOM),
  };
}

/** A cover fit at 100% is the minimum size that fills the entire viewport. */
export function cropFromPosition(size: ImageSize, aspectRatio: number, value: ImagePosition): RelativeImageCrop {
  if (!(size.width > 0 && size.height > 0 && aspectRatio > 0) || ![size.width, size.height, aspectRatio].every(Number.isFinite)) throw new Error('Invalid image dimensions.');
  const position = normalizeImagePosition(value);
  const imageRatio = size.width / size.height;
  const width = Math.min(1, aspectRatio / imageRatio) / position.zoom;
  const height = Math.min(1, imageRatio / aspectRatio) / position.zoom;
  return { x: (1 - width) * position.x, y: (1 - height) * position.y, width, height, zoom: position.zoom };
}

export function positionFromCrop(crop: RelativeImageCrop): ImagePosition {
  return normalizeImagePosition({
    x: crop.width < 1 ? crop.x / (1 - crop.width) : 0.5,
    y: crop.height < 1 ? crop.y / (1 - crop.height) : 0.5,
    zoom: crop.zoom,
  });
}

/** Positive pixel movement moves the image with the pointer, not against it. */
export function panImage(position: ImagePosition, size: ImageSize, viewport: ImageSize, dx: number, dy: number): ImagePosition {
  if (viewport.width <= 0 || viewport.height <= 0) return normalizeImagePosition(position);
  const crop = cropFromPosition(size, viewport.width / viewport.height, position);
  return positionFromCrop({ ...crop,
    x: clamp(crop.x - dx / viewport.width * crop.width, 0, 1 - crop.width),
    y: clamp(crop.y - dy / viewport.height * crop.height, 0, 1 - crop.height),
  });
}

/** Keep the source pixel under a viewport-relative pointer stationary while zooming. */
export function zoomImage(position: ImagePosition, size: ImageSize, aspectRatio: number, zoom: number, anchor = { x: 0.5, y: 0.5 }): ImagePosition {
  const current = cropFromPosition(size, aspectRatio, position);
  const next = cropFromPosition(size, aspectRatio, { ...position, zoom });
  const ax = clamp(finite(anchor.x, 0.5), 0, 1);
  const ay = clamp(finite(anchor.y, 0.5), 0, 1);
  return positionFromCrop({ ...next,
    x: clamp(current.x + ax * (current.width - next.width), 0, 1 - next.width),
    y: clamp(current.y + ay * (current.height - next.height), 0, 1 - next.height),
  });
}

/** Use with a 100% × 100% object-fit:cover image inside an overflow:hidden viewport. */
export function imagePositionStyle(position: ImagePosition) {
  const p = normalizeImagePosition(position);
  const origin = `${p.x * 100}% ${p.y * 100}%`;
  return { objectPosition: origin, transform: `scale(${p.zoom})`, transformOrigin: origin };
}

export function sourceCropPixels(size: ImageSize, crop: RelativeImageCrop) {
  if (![size.width, size.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('The image has not loaded.');
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0 || crop.width > 1 || crop.height > 1 || crop.x < 0 || crop.y < 0 || crop.x + crop.width > 1.0000001 || crop.y + crop.height > 1.0000001) throw new Error('Invalid crop bounds.');
  return { x: crop.x * size.width, y: crop.y * size.height, width: crop.width * size.width, height: crop.height * size.height };
}

/** Draw the same source rectangle shown by the CSS preview, without resampling the original. */
export async function renderImageCrop(image: HTMLImageElement, crop: RelativeImageCrop, options: { outputWidth?: number; mimeType?: 'image/png' | 'image/jpeg' | 'image/webp'; quality?: number; circle?: boolean } = {}) {
  const source = sourceCropPixels({ width: image.naturalWidth, height: image.naturalHeight }, crop);
  const ratio = source.width / source.height;
  if (ratio < 1 / 4096 || ratio > 4096) throw new Error('Choose a less narrow crop before exporting.');
  const requested = finite(options.outputWidth, Math.min(source.width, 2048));
  const width = Math.max(1, Math.floor(Math.min(Math.max(1, requested), source.width, 4096, 4096 * ratio)));
  const height = Math.max(1, Math.min(4096, Math.round(width / ratio)));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare this image.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (options.mimeType === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); }
  if (options.circle) { context.beginPath(); context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2); context.clip(); }
  context.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    try { canvas.toBlob((value) => value ? resolve(value) : reject(new Error('This image could not be saved.')), options.mimeType ?? 'image/webp', clamp(finite(options.quality, 0.92), 0, 1)); }
    catch { reject(new Error('This image can’t be saved from its current source. Choose an image file from your device.')); }
  });
  return { blob, canvas };
}
