import { prepareDocumentPages } from './documentPages.mjs';
export async function generateDocumentPages(url: string, prefix: string, upload: (path: string, blob: Blob) => Promise<void>) {
  const { loadPdfJs, pdfSourceOptions } = await import('../../components/media/PdfPage');
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument(pdfSourceOptions(url, true));
  try {
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    const pdf = await Promise.race([task.promise, new Promise<never>((_, reject) => { loadTimer = setTimeout(() => reject(new Error('PDF load timed out')), 30000); })]).finally(() => clearTimeout(loadTimer));
    const prepared = await prepareDocumentPages({ count: pdf.numPages, limit: 60, upload,
      path: async (number: number, size: number, blob: Blob) => {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
        const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${prefix}/${number}-${hash}-${size}.webp`;
      },
      render: async (number: number, size: number) => {
        const page = await pdf.getPage(number);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: size / Math.max(base.width, base.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
        try {
          const rendering = page.render({ canvas, viewport, background: '#ffffff' });
          const renderTimer = setTimeout(() => rendering.cancel(), 20000);
          try { await rendering.promise; } finally { clearTimeout(renderTimer); }
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value?.type === 'image/webp' ? resolve(value) : reject(new Error('WebP unavailable')), 'image/webp', 0.86));
          return { blob, width: canvas.width, height: canvas.height };
        } finally { canvas.width = canvas.height = 0; page.cleanup(); }
      },
    });
    return { ...prepared, count: pdf.numPages };
  } finally { await task.destroy(); }
}
