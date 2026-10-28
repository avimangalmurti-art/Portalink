/** Inline reading belongs to the current browsing session, independently of density. */
export type CataloguePagePosition = { index: number; key: string; attachmentId?: string; page?: number };

const positions = new Map<string, CataloguePagePosition>();

export function getCataloguePagePosition(projectId: string): CataloguePagePosition | undefined {
  const position = positions.get(projectId);
  return position ? { ...position } : undefined;
}

export function rememberCataloguePagePosition(projectId: string, position: CataloguePagePosition): void {
  if (!projectId || !position.key) return;
  positions.set(projectId, {
    index: Number.isFinite(position.index) ? Math.max(0, Math.floor(position.index)) : 0,
    key: position.key,
    ...(position.attachmentId ? { attachmentId: position.attachmentId } : {}),
    ...(Number.isInteger(position.page) && Number(position.page) > 0 ? { page: position.page } : {}),
  });
}

/** Resolve without writing: an incomplete attachment load must not erase a remembered page. */
export function resolveCataloguePageIndex(slideKeys: readonly string[], position?: CataloguePagePosition): number {
  if (!position || slideKeys.length === 0) return 0;
  const matching = slideKeys.indexOf(position.key);
  if (matching >= 0) return matching;
  const index = Number.isFinite(position.index) ? Math.floor(position.index) : 0;
  return Math.max(0, Math.min(slideKeys.length - 1, index));
}
