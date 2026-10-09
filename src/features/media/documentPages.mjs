export const DOCUMENT_PAGE_SIZES = Object.freeze([800, 1600]);
/** One page/variant at a time. Failed pages retain the existing PDF fallback. */
export async function prepareDocumentPages({ count, limit = 60, render, upload, path }) {
  if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('Invalid PDF page count');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('Invalid page limit');
  const pages = [], failed = [];
  for (let number = 1; number <= Math.min(count, limit); number++) {
    try {
      const variants = [];
      for (const size of DOCUMENT_PAGE_SIZES) {
        const variant = await render(number, size);
        const storagePath = await path(number, size, variant.blob);
        await upload(storagePath, variant.blob);
        variants.push({ storagePath, size, width: variant.width, height: variant.height });
      }
      pages.push({ number, variants });
    } catch { failed.push(number); }
  }
  return { pages, failed, backfillFrom: count > limit ? limit + 1 : null };
}

/** Keep original page positions when previews are partial or failed. */
export function documentPageSlots(available, count, attachmentId) {
  const bounded = Number.isInteger(Number(count)) && Number(count) > 0 && Number(count) <= 5000 ? Number(count) : 0;
  const total = Math.max(available.length, bounded, ...available.map(page => page.withinDocumentIndex));
  if (!available.length) return [];
  const byNumber = new Map(available.map(page => [page.withinDocumentIndex, page]));
  return Array.from({ length: Math.min(total, 5000) }, (_, index) => byNumber.get(index + 1) ?? {
    index: index + 1, withinDocumentIndex: index + 1, attachmentId,
    storagePath: '', sourceUrl: '', width: 800, height: 1035, aspectRatio: 800 / 1035,
  });
}
