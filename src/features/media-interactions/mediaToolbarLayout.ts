/** Width of the artwork itself, excluding letterboxing in a focused image. */
export function displayedPageWidth(width: number, height: number, naturalWidth = 0, naturalHeight = 0, contained = false): number {
  if (contained && height > 0 && naturalWidth > 0 && naturalHeight > 0) {
    return Math.min(width, height * naturalWidth / naturalHeight);
  }
  return width;
}

/** The whole row targets 15% of the page, with a compact floor and a large-page cap.
 * Counts receive their own space so they cannot push buttons outside the row.
 * Very narrow thumbnails take precedence over the compact floor. */
export function mediaToolbarLayout(pageWidth: number, hostWidth: number, inset: number, counts: string[]) {
  const slots = [...counts.map((count) => Math.max(32, count ? 28 + count.length * 7 : 32)), 32];
  const baseWidth = slots.reduce((sum, slot) => sum + slot, 0) + 28;
  const availableWidth = Math.max(0, Math.min(pageWidth, hostWidth) - inset * 2);
  const width = Math.min(availableWidth, 220, Math.max(baseWidth * 0.64, pageWidth * 0.15));
  return { width, unit: width / baseWidth, slots };
}
