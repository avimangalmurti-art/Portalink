type ViewerMemory = {
  activeAttachmentId?: string | null;
  focusedPageId?: string | null;
  focusedPageNumber?: number | null;
  zoom?: number;
  scrollTop?: number;
};

const STORAGE_PREFIX = 'portalink.viewer.';
const memory = new Map<string, ViewerMemory>();
const persistFrames = new Map<string, number>();

export function readViewerMemory(key: string): ViewerMemory {
  const cached = memory.get(key);
  if (cached) return cached;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    const parsed = raw ? JSON.parse(raw) as ViewerMemory : {};
    memory.set(key, parsed);
    return parsed;
  } catch {
    const empty: ViewerMemory = {};
    memory.set(key, empty);
    return empty;
  }
}

export function updateViewerMemory(key: string, patch: Partial<ViewerMemory>): void {
  const next = { ...readViewerMemory(key), ...patch };
  memory.set(key, next);
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
