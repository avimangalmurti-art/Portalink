import type { Id, Project } from '../../types/domain';

export type ProjectIndexSort = 'custom' | 'newest' | 'oldest' | 'alphabetical';
export type ProjectIndexFilter = 'all' | 'visible' | 'hidden' | 'saved';

type ProjectIndexControls = {
  sort: ProjectIndexSort;
  filter: ProjectIndexFilter;
  query: string;
  hiddenIds: readonly Id[];
  savedIds: readonly Id[];
};

/** Project filtering and ordering are presentation only; canonical records stay untouched. */
export function applyProjectIndexControls(projects: readonly Project[], controls: ProjectIndexControls): Project[] {
  const hidden = new Set(controls.hiddenIds);
  const saved = new Set(controls.savedIds);
  const normalizedQuery = controls.query.trim().toLocaleLowerCase();
  const filtered = projects.filter((project) => {
    if (controls.filter === 'visible' && hidden.has(project.id)) return false;
    if (controls.filter === 'hidden' && !hidden.has(project.id)) return false;
    if (controls.filter === 'saved' && !saved.has(project.id)) return false;
    return !normalizedQuery || `${project.title} ${project.summary}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  if (controls.sort === 'custom') return filtered;

  // The input position is the deterministic tie-breaker and remains the fallback
  // for legacy work without a trustworthy publication time.
  const inputPosition = new Map(projects.map((project, index) => [project.id, index]));
  const publicationTime = (project: Project) => {
    const time = project.publishedAt ? Date.parse(project.publishedAt) : Number.NaN;
    return Number.isFinite(time) ? time : null;
  };
  return [...filtered].sort((left, right) => {
    if (controls.sort === 'alphabetical') {
      const byTitle = left.title.localeCompare(right.title, undefined, { sensitivity: 'base', numeric: true });
      return byTitle || (inputPosition.get(left.id) ?? 0) - (inputPosition.get(right.id) ?? 0);
    }
    const leftTime = publicationTime(left);
    const rightTime = publicationTime(right);
    if (leftTime === null || rightTime === null) {
      if (leftTime === null && rightTime !== null) return 1;
      if (leftTime !== null && rightTime === null) return -1;
    } else if (leftTime !== rightTime) {
      return controls.sort === 'newest' ? rightTime - leftTime : leftTime - rightTime;
    }
    return (inputPosition.get(left.id) ?? 0) - (inputPosition.get(right.id) ?? 0);
  });
}

export function projectIndexCountLabel(total: number, shown: number): string {
  const noun = total === 1 ? 'project' : 'projects';
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}
