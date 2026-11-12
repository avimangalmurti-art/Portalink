import { renderCoverAssets, renderCoverVariants, type CoverThumbnailInput, type CoverThumbnailRuntime, type DecodedCoverSource } from './coverThumbnailCore.mjs';

export type { CoverThumbnailInput, CoverThumbnailVariant } from './coverThumbnailCore.mjs';

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

async function loadImage(url: string): Promise<DecodedCoverSource> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('The cover image took too long to load. Try again.')), 30_000);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout); image.onload = null; image.onerror = null;
      if (error) { image.src = ''; reject(error); } else resolve();
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('The cover image could not be loaded.'));
    image.src = url;
  });
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => { image.src = ''; } };
}

async function renderPdfPage(url: string, pageNumber: number, maxLongEdge: number, onDocumentInfo?: (info: LocalDocumentInfo) => void): Promise<DecodedCoverSource> {
  // The same PDF.js loader, range options and page.render path as PdfPage; this
  // module is itself imported only by publishing, never by thumbnail grids.
  const { loadPdfJs, pdfSourceOptions } = await import('../../components/media/PdfPage');
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument(pdfSourceOptions(url, true));
  let timeout: number | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => { void task.destroy().catch(() => undefined); reject(new Error('Preparing the PDF cover took too long. Try again.')); }, 60_000);
  });
  try {
    return await Promise.race([deadline, (async () => {
      const pdf = await task.promise;
      const page = await pdf.getPage(Math.min(pdf.numPages, pageNumber));
      const base = page.getViewport({ scale: 1 });
      if (onDocumentInfo) void pdf.getMetadata().then(({ info }) => {
        const data = info as { Title?: string; CreationDate?: string };
        onDocumentInfo({ title: data.Title, createdAt: pdfjs.PDFDateString.toDateObject(data.CreationDate ?? ''), pageCount: pdf.numPages, width: base.width, height: base.height });
      }).catch(() => onDocumentInfo({ pageCount: pdf.numPages, width: base.width, height: base.height }));
      const viewport = page.getViewport({ scale: maxLongEdge / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)));
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      return { source: canvas, width: canvas.width, height: canvas.height };
    })()]);
  } finally { window.clearTimeout(timeout); await task.destroy().catch(() => undefined); }
}

async function loadVideoFrame(url: string): Promise<DecodedCoverSource> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous'; video.muted = true; video.playsInline = true; video.preload = 'auto';
  const dispose = () => { video.pause(); video.removeAttribute('src'); video.load(); };
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('The video cover took too long to load. Try again.')), 30_000);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout); video.onloadeddata = null; video.onerror = null;
        if (error) reject(error); else resolve();
      };
      // loadeddata exposes the first decoded frame without requiring autoplay.
      video.onloadeddata = () => finish();
      video.onerror = () => finish(new Error('The video has no readable first frame. Choose a cover image.'));
      video.src = url; video.load();
    });
    return { source: video, width: video.videoWidth, height: video.videoHeight, dispose };
  } catch (error) { dispose(); throw error; }
}

async function encodeWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  const native = await new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, 'image/webp', 0.86);
    } catch { reject(new Error('The cover cannot be read from this source. Choose a local cover file.')); }
  });
  if (native?.type === 'image/webp') return native;
  // Safari can return PNG for a WebP request. Stored covers require real WebP bytes.
  const { encodeCoverWebp } = await import('./coverWebpEncoder');
  return encodeCoverWebp(canvas);
}

const browserRuntime: CoverThumbnailRuntime = {
  createCanvas, loadImage, renderPdfPage, loadVideoFrame, encodeWebp,
};

/** Bakes the chosen frame once at publish time; originals remain untouched. */
export type LocalDocumentInfo = { title?: string; createdAt?: Date | null; pageCount: number; width?: number; height?: number };
export function generateCoverThumbnails(input: CoverThumbnailInput, onDocumentInfo?: (info: LocalDocumentInfo) => void) {
  return renderCoverVariants(input, onDocumentInfo ? { ...browserRuntime,
    renderPdfPage: (url, page, size) => renderPdfPage(url, page, size, onDocumentInfo),
  } : browserRuntime);
}

export function generateShareCoverAssets(input: CoverThumbnailInput) { return renderCoverAssets(input, browserRuntime); }
