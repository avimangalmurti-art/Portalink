export type ProjectPanel = 'index' | 'response';

export const projectPanelGeometry = { rail: 52, workMinimum: 320, indexMinimum: 220 } as const;

/** Allocate sibling panels together, without changing the user's saved widths. */
export function allocateProjectPanels(width: number, indexWanted: boolean, responseWanted: boolean,
  indexPreferred: number, responsePreferred: number, responseMinimum: number,
  lastOpened: ProjectPanel | null, compactPanel: ProjectPanel | null, hasResponse = true, indexOnly = false) {
  const { rail, workMinimum, indexMinimum } = projectPanelGeometry;
  const available = Number.isFinite(width) ? Math.max(0, Math.floor(width)) : 0;
  if (indexOnly) {
    return { indexWidth: available, responseWidth: 0, workWidth: 0,
      indexOpen: true, responseOpen: false, singlePanel: 'index' as const };
  }
  if (!hasResponse && compactPanel === 'response') compactPanel = null;
  const chosenMinimum = compactPanel === 'index' ? indexMinimum : responseMinimum;
  if (compactPanel && available < workMinimum + rail + chosenMinimum) {
    return { indexWidth: compactPanel === 'index' ? available : 0,
      responseWidth: compactPanel === 'response' ? available : 0, workWidth: 0,
      indexOpen: compactPanel === 'index', responseOpen: compactPanel === 'response', singlePanel: compactPanel };
  }
  let indexOpen = indexWanted;
  let responseOpen = hasResponse && responseWanted;
  const priority = lastOpened ?? 'index';
  const order: ProjectPanel[] = priority === 'index' ? ['response', 'index'] : ['index', 'response'];
  const responseBase = () => hasResponse ? responseOpen ? responseMinimum : rail : 0;
  for (const panel of order) {
    if ((indexOpen ? indexMinimum : rail) + responseBase() + workMinimum <= available) break;
    if (panel === 'index') indexOpen = false;
    else responseOpen = false;
  }
  const indexBase = indexOpen ? indexMinimum : Math.min(rail, available);
  const rightBase = Math.min(responseBase(), Math.max(0, available - indexBase));
  const indexGrowth = indexOpen ? Math.max(0, Math.min(420, indexPreferred) - indexMinimum) : 0;
  const responseGrowth = responseOpen ? Math.max(0, Math.min(440, responsePreferred) - responseMinimum) : 0;
  const extra = Math.max(0, available - workMinimum - indexBase - rightBase);
  // The last opened/resized panel owns its requested size; its sibling yields.
  // Proportional compression would make a drag write a smaller preferred width
  // and could move the handle backwards relative to the pointer.
  const indexExtra = Math.min(indexGrowth, priority === 'index' ? extra : Math.max(0, extra - responseGrowth));
  const responseExtra = Math.min(responseGrowth, priority === 'response' ? extra : Math.max(0, extra - indexGrowth));
  const indexWidth = indexBase + indexExtra;
  const responseWidth = rightBase + responseExtra;
  return { indexWidth, responseWidth, workWidth: available - indexWidth - responseWidth,
    indexOpen, responseOpen, singlePanel: null };
}
