export type ViewerMemory = {
  activeAttachmentId?: string | null;
  focusedPageId?: string | null;
  focusedPageNumber?: number | null;
  lastFocusedPageId?: string | null;
  lastFocusedPageNumber?: number | null;
  zoom?: number;
  pagesPerRow?: number;
  scrollTop?: number;
  scrollLeft?: number;
};

const STORAGE_PREFIX = 'portalink.viewer.';
const memory = new Map<string, ViewerMemory>();
const persistFrames = new Map<string, number>();
const observers = new Set<(key: string, state: ViewerMemory) => void>();

/** MOBILE opts into a small device checkpoint; ordinary viewer storage is unchanged. */
export function observeViewerMemory(observer: (key: string, state: ViewerMemory) => void): () => void {
  observers.add(observer);
  return () => { observers.delete(observer); };
}

/** Called only with validated launch hints before the reader mounts. */
export function primeViewerMemory(key: string, state: ViewerMemory): void {
  memory.set(key, { ...state });
  try { window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(state)); } catch { /* Memory remains usable. */ }
}

export function readViewerMemory(key: string): ViewerMemory {
  const cached = memory.get(key);
  if (cached) return cached;
  let parsed: ViewerMemory = {};
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as ViewerMemory;
  } catch { /* Persistent density can still be restored independently. */ }
  try {
    const density = Number(window.localStorage?.getItem(`${STORAGE_PREFIX}${key}.density`));
    if (Number.isInteger(density) && density >= 1 && density <= 9) parsed.pagesPerRow = density;
  } catch { /* The session/in-memory copy remains available. */ }
  memory.set(key, parsed);
  return parsed;
}

export function updateViewerMemory(key: string, patch: Partial<ViewerMemory>): void {
  const next = { ...readViewerMemory(key), ...patch };
  memory.set(key, next);
  for (const observer of observers) {
    try { observer(key, next); } catch { /* Optional position checkpoints cannot interrupt a reader. */ }
  }
  if (patch.pagesPerRow !== undefined) {
    try { window.localStorage?.setItem(`${STORAGE_PREFIX}${key}.density`, String(patch.pagesPerRow)); } catch { /* The session copy still works if persistent storage is unavailable. */ }
  }
  if (persistFrames.has(key)) return;
  const frame = window.requestAnimationFrame(() => {
    persistFrames.delete(key);
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(memory.get(key) ?? {}));
    } catch {
      // The in-memory copy still preserves continuity for this mounted session.
    }
  });
  persistFrames.set(key, frame);
}
