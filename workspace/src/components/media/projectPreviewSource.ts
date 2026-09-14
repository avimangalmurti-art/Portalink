import { loadPdfJs, pdfSourceOptions } from './PdfPage';

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The preview could not be prepared. Try again.')), 'image/png'); }
    catch { reject(new Error('This preview could not be read. Try replacing the cover file in Edit project.')); }
  });
}

/** Rasterize only the selected cover page/frame for editing. The project keeps its original file. */
export async function projectPreviewSource(source: string, kind: 'document' | 'video', pageNumber: number, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (kind === 'document') {
    const pdfjs = await loadPdfJs();
    signal.throwIfAborted();
    const task = pdfjs.getDocument(pdfSourceOptions(source));
    const cancel = () => { void task.destroy().catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const pdf = await task.promise;
      signal.throwIfAborted();
      const page = await pdf.getPage(Math.max(1, Math.min(pdf.numPages, Math.floor(pageNumber) || 1)));
      signal.throwIfAborted();
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1920 / original.width, 1920 / original.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas, viewport, background: '#ffffff' }).promise;
      signal.throwIfAborted();
      return await canvasBlob(canvas);
    } finally {
      signal.removeEventListener('abort', cancel);
      await task.destroy().catch(() => undefined);
    }
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error('The video preview took too long to load. Try again.')), 20_000);
      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        video.onloadeddata = null;
        video.onerror = null;
        signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve();
      };
      const abort = () => finish(new DOMException('Preview cancelled', 'AbortError'));
      video.onloadeddata = () => finish();
      video.onerror = () => finish(new Error('The video preview could not be loaded. Try again.'));
      signal.addEventListener('abort', abort, { once: true });
      video.src = source;
      video.load();
    });
    signal.throwIfAborted();
    if (!video.videoWidth || !video.videoHeight) throw new Error('This video has no readable preview.');
    const scale = Math.min(1, 1920 / video.videoWidth, 1920 / video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this preview.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await canvasBlob(canvas);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}
