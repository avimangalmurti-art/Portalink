import type { ProjectCoverFrame } from '../types/domain';

export const DEFAULT_PROJECT_COVER_FRAME: ProjectCoverFrame = {
  x: 0.5,
  y: 0.5,
  zoom: 1,
};

export const MIN_PROJECT_COVER_ZOOM = 1;
export const MAX_PROJECT_COVER_ZOOM = 3;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Accept only finite persisted values and keep them inside the editor range. */
export function normalizeProjectCoverFrame(value: unknown): ProjectCoverFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_PROJECT_COVER_FRAME;
  }
  const candidate = value as Partial<Record<keyof ProjectCoverFrame, unknown>>;
  return {
    x: typeof candidate.x === 'number' && Number.isFinite(candidate.x)
      ? clamp(candidate.x, 0, 1)
      : DEFAULT_PROJECT_COVER_FRAME.x,
    y: typeof candidate.y === 'number' && Number.isFinite(candidate.y)
      ? clamp(candidate.y, 0, 1)
      : DEFAULT_PROJECT_COVER_FRAME.y,
    zoom: typeof candidate.zoom === 'number' && Number.isFinite(candidate.zoom)
      ? clamp(candidate.zoom, MIN_PROJECT_COVER_ZOOM, MAX_PROJECT_COVER_ZOOM)
      : DEFAULT_PROJECT_COVER_FRAME.zoom,
  };
}

export function isDefaultProjectCoverFrame(frame: ProjectCoverFrame): boolean {
  return frame.x === DEFAULT_PROJECT_COVER_FRAME.x
    && frame.y === DEFAULT_PROJECT_COVER_FRAME.y
    && frame.zoom === DEFAULT_PROJECT_COVER_FRAME.zoom;
}
